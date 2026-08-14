// Reusable IndexedDB store. Backs the local-first data layer: the local user
// identity today, and the book/chunk/progress/bookmark metadata (#18 data
// contracts). The audio cache (#6) stays in OPFS — this DB is only for the
// lightweight structured records.
//
// Two object stores:
//   "kv"      — generic key/value (user identity, misc).
//   "books"   — structured records keyed by a composite key so books, chunks,
//               progress, and bookmarks share one store with predictable
//               key prefixes for range queries.
//
// Opened lazily and cached so all callers share one connection.

const DB_NAME = "local-tts";
const DB_VERSION = 2;
const KV_STORE = "kv";
const BOOKS_STORE = "books";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        db.createObjectStore(BOOKS_STORE); // keyPath null → keys are composite strings
      }
      // v1 → v2: add books store. Existing kv data is preserved (object stores
      // are additive; we never delete the old one on upgrade).
      void event;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// --- kv store (generic key/value) ---

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

// --- books store (structured records with composite keys) ---
//
// Key scheme (composite strings, lexicographically sortable):
//   book:{bookId}                           → Book
//   chunk:{bookId}:{chunkId}                → Chunk
//   progress:{bookId}                       → Progress
//   bookmark:{bookId}:{bookmarkId}          → Bookmark
//
// Range queries use IDBKeyRange with string prefixes — e.g. all chunks of a
// book = range ["chunk:{bookId}:", "chunk:{bookId}:\xff").

export async function booksGet<T>(key: string): Promise<T | undefined> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BOOKS_STORE, "readonly").objectStore(BOOKS_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function booksSet<T>(key: string, value: T): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readwrite");
    tx.objectStore(BOOKS_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function booksDelete(key: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readwrite");
    tx.objectStore(BOOKS_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Deletes all keys matching a prefix (e.g. all records for a book). */
export async function booksDeleteByPrefix(prefix: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readwrite");
    const store = tx.objectStore(BOOKS_STORE);
    const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
    store.delete(range);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Gets all values whose keys start with a prefix, in key order. */
export async function booksGetByPrefix<T>(prefix: string): Promise<T[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readonly");
    const store = tx.objectStore(BOOKS_STORE);
    const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
    const results: T[] = [];
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value as T);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
