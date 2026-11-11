import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CertificateTemplate, GenerationHistoryItem } from '../types';

interface CertiGenDB extends DBSchema {
  templates: {
    key: string;
    value: CertificateTemplate;
    indexes: { 'by-date': number };
  };
  history: {
    key: string;
    value: GenerationHistoryItem;
    indexes: { 'by-date': number };
  };
  settings: {
    key: string;
    value: { key: string; value: any };
  };
}

const DB_NAME = 'certigen-database';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CertiGenDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<CertiGenDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CertiGenDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('templates')) {
          const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
          templateStore.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('by-date', 'timestamp');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Templates operations
export async function getAllTemplates(): Promise<CertificateTemplate[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('templates', 'by-date');
  return list.reverse(); // Newest first
}

export async function getTemplateById(id: string): Promise<CertificateTemplate | undefined> {
  const db = await getDb();
  return db.get('templates', id);
}

export async function saveTemplate(template: CertificateTemplate): Promise<void> {
  const db = await getDb();
  try {
    await db.put('templates', template);
  } catch (err: any) {
    console.warn('Initial db.put failed, attempting sanitized template save:', err);
    try {
      const sanitized: any = { ...template };
      if (template.blob instanceof Blob) {
        try {
          const ab = await template.blob.arrayBuffer();
          sanitized.blob = new Blob([ab], { type: template.blob.type || 'image/png' });
        } catch {
          delete sanitized.blob;
        }
      } else {
        delete sanitized.blob;
      }
      await db.put('templates', sanitized);
    } catch (finalErr) {
      console.error('Failed to save template to IndexedDB:', finalErr);
      throw finalErr;
    }
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('templates', id);
}

// Generation History operations
export async function getHistory(): Promise<GenerationHistoryItem[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('history', 'by-date');
  return list.reverse();
}

export async function addHistoryItem(item: GenerationHistoryItem): Promise<void> {
  const db = await getDb();
  await db.put('history', item);
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('history', id);
}

export async function clearAllHistory(): Promise<void> {
  const db = await getDb();
  await db.clear('history');
}

// Settings operations
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await getDb();
  const entry = await db.get('settings', key);
  return entry ? (entry.value as T) : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}
