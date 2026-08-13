// Reusable IndexedDB key-value store. Backs the local-first data layer: the
// local user identity today, and the local book/chunk/progress metadata later
// (the local mirror of what #18 writes to Firestore when sync is enabled).
//
// One object store ("kv"), keyPath null → generic key/value. Opened lazily and
// cached so all callers share one connection. The audio cache (#6) stays in
// OPFS — this DB is only for the lightweight structured records.

const DB_NAME = "local-tts";
const DB_VERSION = 1;
const KV_STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KV_STORE)) {
        req.result.createObjectStore(KV_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(KV_STORE, "readonly").objectStore(KV_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function kvDelete(key: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Test-only: resets the cached connection so a fresh open re-runs upgrades.
export function _resetDbCacheForTests(): void {
  dbPromise = null;
}
