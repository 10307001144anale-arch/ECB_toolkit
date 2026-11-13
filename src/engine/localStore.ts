// Generated PDFs are kept in this browser's IndexedDB (not on the server) so
// participant data stays on the client's device. Files are deleted
// automatically after the retention period.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PhotoCrop } from '../../shared/types';
import type { ParticipantData } from './spreadsheet';

export const RETENTION_DAYS = 7;

interface OutputDB extends DBSchema {
  files: {
    key: string; // `${batchId}:${index}`
    value: { id: string; batchId: string; index: number; fileName: string; blob: Blob; createdAt: number };
    indexes: { byBatch: string };
  };
  batches: {
    key: string;
    value: { batchId: string; name: string; createdAt: number; expiresAt: number; count: number };
  };
  /** Everything needed to re-open a batch for editing (participant rows, photos, signatures, crops). */
  sessions: {
    key: string;
    value: BatchSession;
  };
}

export interface BatchSession {
  batchId: string;
  savedAt: number;
  data: ParticipantData;
  excluded: number[];
  crops: Record<string, PhotoCrop>;
  images: { name: string; blob: Blob; size: number }[];
  /** Spreadsheet row index for each generated position (to open a single certificate). */
  rowIndices: number[];
}

let dbp: Promise<IDBPDatabase<OutputDB>> | null = null;
function getDb() {
  if (!dbp) {
    dbp = openDB<OutputDB>('certigen-outputs', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const files = db.createObjectStore('files', { keyPath: 'id' });
          files.createIndex('byBatch', 'batchId');
          db.createObjectStore('batches', { keyPath: 'batchId' });
        }
        if (oldVersion < 2) db.createObjectStore('sessions', { keyPath: 'batchId' });
      },
    });
  }
  return dbp;
}

export async function startLocalBatch(batchId: string, name: string) {
  const db = await getDb();
  const t = Date.now();
  await db.put('batches', { batchId, name, createdAt: t, expiresAt: t + RETENTION_DAYS * 86400000, count: 0 });
}

export async function saveOutput(batchId: string, index: number, fileName: string, bytes: Uint8Array) {
  const db = await getDb();
  await db.put('files', {
    id: `${batchId}:${index}`,
    batchId,
    index,
    fileName,
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    createdAt: Date.now(),
  });
}

export async function finishLocalBatch(batchId: string) {
  const db = await getDb();
  const meta = await db.get('batches', batchId);
  if (!meta) return;
  meta.count = await db.countFromIndex('files', 'byBatch', batchId);
  await db.put('batches', meta);
}

export async function listOutputs(batchId: string) {
  const db = await getDb();
  const all = await db.getAllFromIndex('files', 'byBatch', batchId);
  return all.sort((a, b) => a.index - b.index);
}

export async function localBatchInfo(batchId: string) {
  const db = await getDb();
  return db.get('batches', batchId);
}

export async function allLocalBatches() {
  const db = await getDb();
  return db.getAll('batches');
}

/** Saves the working data of a batch so it can be edited and generated again (same retention as the PDFs). */
export async function saveBatchSession(session: BatchSession) {
  const db = await getDb();
  await db.put('sessions', session);
}

export async function getBatchSession(batchId: string): Promise<BatchSession | undefined> {
  const db = await getDb();
  return db.get('sessions', batchId);
}

export async function allSessionIds(): Promise<Set<string>> {
  const db = await getDb();
  return new Set((await db.getAllKeys('sessions')) as string[]);
}

export async function deleteLocalBatch(batchId: string) {
  const db = await getDb();
  const tx = db.transaction(['files', 'batches', 'sessions'], 'readwrite');
  let cursor = await tx.objectStore('files').index('byBatch').openCursor(batchId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore('batches').delete(batchId);
  await tx.objectStore('sessions').delete(batchId);
  await tx.done;
}

/** Removes expired batches. Called on start-up. */
export async function purgeExpiredOutputs() {
  try {
    const db = await getDb();
    const now = Date.now();
    for (const b of await db.getAll('batches')) {
      if (b.expiresAt < now) await deleteLocalBatch(b.batchId);
    }
  } catch {
    /* IndexedDB unavailable (private mode) — nothing to purge */
  }
}

export async function deleteAllLocalOutputs() {
  const db = await getDb();
  await db.clear('files');
  await db.clear('batches');
  await db.clear('sessions');
}
