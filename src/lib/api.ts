// Small fetch wrapper for the CertiGen API. Cookies carry the session; the
// X-Requested-With header satisfies the server's CSRF guard.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Listener = () => void;
const unauthorisedListeners = new Set<Listener>();
export function onUnauthorised(fn: Listener) {
  unauthorisedListeners.add(fn);
  return () => unauthorisedListeners.delete(fn);
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'certigen' };
  let payload: BodyInit | undefined;
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    payload = body as BodyInit;
    headers['Content-Type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && !url.startsWith('/api/auth/')) unauthorisedListeners.forEach((l) => l());
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new ApiError(res.status, json?.error || `Request failed (${res.status}).`);
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, file: Blob) => request<T>('POST', url, file),
};

/** Fetches a stored file (artwork, preview, signature, font) as bytes, cached for the session. */
const fileCache = new Map<string, Promise<ArrayBuffer>>();
export function fetchFile(id: string): Promise<ArrayBuffer> {
  let p = fileCache.get(id);
  if (!p) {
    p = fetch(`/api/files/${encodeURIComponent(id)}`, { credentials: 'same-origin' }).then(async (r) => {
      if (!r.ok) throw new ApiError(r.status, 'Could not load a template file.');
      return r.arrayBuffer();
    });
    fileCache.set(id, p);
    p.catch(() => fileCache.delete(id));
  }
  return p.then((b) => b.slice(0));
}

export function fileUrl(id: string | null | undefined): string | undefined {
  return id ? `/api/files/${encodeURIComponent(id)}` : undefined;
}

export interface AppConfig {
  appUrl: string | null;
  microsoftConfigured: boolean;
  aiDetectionAvailable: boolean;
  issuerName: string | null;
}

let configPromise: Promise<AppConfig> | null = null;
export function getConfig() {
  if (!configPromise) configPromise = api.get<AppConfig>('/api/public/config');
  return configPromise;
}

export function verifyBaseUrl(cfg: AppConfig | null): string {
  return (cfg?.appUrl || window.location.origin).replace(/\/+$/, '');
}
