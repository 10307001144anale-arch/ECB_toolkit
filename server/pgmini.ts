// Minimal PostgreSQL client used only by the automated tests in this
// repository (so they can run against a local PostgreSQL without network
// access). Production uses the `pg` package — see server/db.ts.
//
// Supports: SCRAM-SHA-256 / cleartext / trust auth, simple and extended query
// protocol with text parameters, sequential queries per connection.

import net from 'node:net';
import crypto from 'node:crypto';

interface Field {
  name: string;
  oid: number;
}
export interface MiniResult {
  rows: any[];
  rowCount: number;
}

const INT_OIDS = new Set([20, 21, 23, 26, 700, 701, 1700]);

function parseValue(v: string | null, oid: number) {
  if (v === null) return null;
  if (INT_OIDS.has(oid)) return Number(v);
  if (oid === 16) return v === 't';
  if (oid === 114 || oid === 3802) return JSON.parse(v);
  return v;
}

function prepareValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex');
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `{${v.map((x) => (x === null ? 'NULL' : `"${String(x).replace(/(["\\])/g, '\\$1')}"`)).join(',')}}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

class Writer {
  parts: Buffer[] = [];
  str(s: string) {
    this.parts.push(Buffer.from(s + '\0', 'utf8'));
    return this;
  }
  i32(n: number) {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    this.parts.push(b);
    return this;
  }
  i16(n: number) {
    const b = Buffer.alloc(2);
    b.writeInt16BE(n);
    this.parts.push(b);
    return this;
  }
  bytes(b: Buffer) {
    this.parts.push(b);
    return this;
  }
  msg(type: string | null) {
    const body = Buffer.concat(this.parts);
    const len = Buffer.alloc(4);
    len.writeInt32BE(body.length + 4);
    return type ? Buffer.concat([Buffer.from(type), len, body]) : Buffer.concat([len, body]);
  }
}

export class MiniClient {
  private sock!: net.Socket;
  private buf = Buffer.alloc(0);
  private waiters: ((m: { type: string; body: Buffer }) => void)[] = [];
  private queue: { type: string; body: Buffer }[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async connect() {
    const u = new URL(this.url);
    this.sock = net.connect({ host: u.hostname, port: Number(u.port || 5432) });
    await new Promise<void>((res, rej) => {
      this.sock.once('connect', () => res());
      this.sock.once('error', rej);
    });
    this.sock.on('data', (d) => this.onData(d));
    const user = decodeURIComponent(u.username);
    const password = decodeURIComponent(u.password);
    const database = u.pathname.slice(1) || user;
    this.sock.write(new Writer().i32(196608).str('user').str(user).str('database').str(database).str('client_encoding').str('UTF8').str('').msg(null));
    let nonce = '';
    let clientFirstBare = '';
    let serverSig = '';
    for (;;) {
      const m = await this.next();
      if (m.type === 'R') {
        const code = m.body.readInt32BE(0);
        if (code === 0) continue;
        if (code === 3) {
          this.sock.write(new Writer().str(password).msg('p'));
        } else if (code === 10) {
          nonce = crypto.randomBytes(18).toString('base64');
          clientFirstBare = `n=*,r=${nonce}`;
          const first = Buffer.from('n,,' + clientFirstBare);
          this.sock.write(new Writer().str('SCRAM-SHA-256').i32(first.length).bytes(first).msg('p'));
        } else if (code === 11) {
          const serverFirst = m.body.subarray(4).toString();
          const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]));
          const salted = crypto.pbkdf2Sync(password.normalize('NFKC'), Buffer.from(attrs.s, 'base64'), Number(attrs.i), 32, 'sha256');
          const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
          const storedKey = crypto.createHash('sha256').update(clientKey).digest();
          const finalNoProof = `c=biws,r=${attrs.r}`;
          const authMessage = `${clientFirstBare},${serverFirst},${finalNoProof}`;
          const sig = crypto.createHmac('sha256', storedKey).update(authMessage).digest();
          const proof = Buffer.from(clientKey.map((b, i) => b ^ sig[i]));
          const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest();
          serverSig = crypto.createHmac('sha256', serverKey).update(authMessage).digest('base64');
          this.sock.write(new Writer().bytes(Buffer.from(`${finalNoProof},p=${proof.toString('base64')}`)).msg('p'));
        } else if (code === 12) {
          if (m.body.subarray(4).toString() !== `v=${serverSig}`) throw new Error('SCRAM server signature mismatch');
        } else throw new Error(`Unsupported auth method ${code}`);
      } else if (m.type === 'E') throw this.err(m.body);
      else if (m.type === 'Z') return;
    }
  }

  private onData(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const m = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      const w = this.waiters.shift();
      if (w) w(m);
      else this.queue.push(m);
    }
  }

  private next(): Promise<{ type: string; body: Buffer }> {
    const m = this.queue.shift();
    if (m) return Promise.resolve(m);
    return new Promise((res) => this.waiters.push(res));
  }

  private err(body: Buffer) {
    const fields: Record<string, string> = {};
    let i = 0;
    while (body[i]) {
      const code = String.fromCharCode(body[i]);
      const end = body.indexOf(0, i + 1);
      fields[code] = body.subarray(i + 1, end).toString();
      i = end + 1;
    }
    return Object.assign(new Error(fields.M || 'PostgreSQL error'), { code: fields.C, detail: fields.D });
  }

  query(text: string, params?: unknown[]): Promise<MiniResult> {
    const run = this.chain.then(() => this.doQuery(text, params));
    this.chain = run.catch(() => {});
    return run;
  }

  private async doQuery(text: string, params?: unknown[]): Promise<MiniResult> {
    if (!params || params.length === 0) {
      this.sock.write(new Writer().str(text).msg('Q'));
    } else {
      const bind = new Writer().str('').str('').i16(0).i16(params.length);
      for (const p of params) {
        const v = prepareValue(p);
        if (v === null) bind.i32(-1);
        else {
          const b = Buffer.from(v, 'utf8');
          bind.i32(b.length).bytes(b);
        }
      }
      bind.i16(0);
      this.sock.write(
        Buffer.concat([
          new Writer().str('').str(text).i16(0).msg('P'),
          bind.msg('B'),
          new Writer().bytes(Buffer.from('P')).str('').msg('D'),
          new Writer().str('').i32(0).msg('E'),
          new Writer().msg('S'),
        ])
      );
    }
    let fields: Field[] = [];
    let rows: any[] = [];
    let rowCount = 0;
    let error: Error | null = null;
    for (;;) {
      const m = await this.next();
      switch (m.type) {
        case 'T': {
          const n = m.body.readInt16BE(0);
          let o = 2;
          fields = [];
          rows = [];
          for (let i = 0; i < n; i++) {
            const end = m.body.indexOf(0, o);
            const name = m.body.subarray(o, end).toString();
            o = end + 1;
            const oid = m.body.readInt32BE(o + 6);
            o += 18;
            fields.push({ name, oid });
          }
          break;
        }
        case 'D': {
          const n = m.body.readInt16BE(0);
          let o = 2;
          const row: any = {};
          for (let i = 0; i < n; i++) {
            const len = m.body.readInt32BE(o);
            o += 4;
            const v = len < 0 ? null : m.body.subarray(o, o + len).toString('utf8');
            if (len > 0) o += len;
            row[fields[i].name] = parseValue(v, fields[i].oid);
          }
          rows.push(row);
          break;
        }
        case 'C': {
          const tag = m.body.subarray(0, m.body.length - 1).toString();
          const num = Number(tag.split(' ').pop());
          rowCount = Number.isFinite(num) ? num : 0;
          break;
        }
        case 'E':
          error = this.err(m.body);
          break;
        case 'Z':
          if (error) throw error;
          return { rows, rowCount };
        default:
          break; // 1, 2, n, N, S, I, s
      }
    }
  }

  release() {}

  end() {
    try {
      this.sock.write(new Writer().msg('X'));
    } catch {
      /* ignore */
    }
    this.sock.end();
  }
}

/** Tiny pool with the same surface as pg.Pool (query / connect / end). */
export class MiniPool {
  private idle: MiniClient[] = [];
  private url: string;
  constructor(url: string) {
    this.url = url;
  }
  async connect() {
    const c = this.idle.pop() || new MiniClient(this.url);
    if (!(c as any).connected) {
      await c.connect();
      (c as any).connected = true;
    }
    const release = () => this.idle.push(c);
    return Object.assign(Object.create(c), { query: c.query.bind(c), release });
  }
  async query(text: string, params?: unknown[]) {
    const c = await this.connect();
    try {
      return await c.query(text, params);
    } finally {
      c.release();
    }
  }
  async end() {
    for (const c of this.idle) c.end();
    this.idle = [];
  }
}
