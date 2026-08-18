// OPFS audio cache: one .wav per chunk, in a directory per book.
//
//   /libros/{bookId}/{chunkId}.{hash}.wav
//
// The filename IS the cache record — no parallel index that can desync from
// the real files. `hash` = first 4 bytes of SHA-256 of the chunk text, so:
//   - exists {chunkId}.{hash(currentText)}.wav → audio available and current
//   - exists {chunkId} with a DIFFERENT hash        → stale, text changed
//   - no {chunkId}.*.wav                            → needs synthesis
//
// Optimization over the PoC:
// - Directory handle is cached per bookId (avoids re-opening OPFS per chunk)
// - Stale file cleanup is batched after all saves, not per-chunk
// - `saveChunkBatch` saves multiple chunks in one directory session
//
// This module runs in the worker (createSyncAccessHandle is worker-only for
// writes). Reads work from either thread but are primarily used by the worker
// to check the cache before synthesizing.

const FILENAME_RE = /^(.+)\.([0-9a-f]{8})\.wav$/;

/** First 4 bytes of SHA-256 of text, as 8-char hex. */
export async function textHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest, 0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds the cache filename: `{chunkId}.{hash}.wav`. */
export function fileName(chunkId: string, hash: string): string {
  return `${chunkId}.${hash}.wav`;
}

/** Parses a cache filename into { chunkId, hash }, or null if not a valid name. */
export function parseFileName(name: string): { chunkId: string; hash: string } | null {
  const m = FILENAME_RE.exec(name);
  return m ? { chunkId: m[1], hash: m[2] } : null;
}

// --- OPFS directory handling ---

// Cache directory handles per bookId so we don't re-open OPFS on every chunk.
// Only safe to cache within a single worker session — OPFS handles are not
// transferable across threads.
const dirCache = new Map<string, FileSystemDirectoryHandle>();

async function getBookDir(
  bookId: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const cached = dirCache.get(bookId);
  if (cached) return cached;

  try {
    const root = await navigator.storage.getDirectory();
    const libros = await root.getDirectoryHandle("libros", { create });
    const dir = await libros.getDirectoryHandle(bookId, { create });
    dirCache.set(bookId, dir);
    return dir;
  } catch (err) {
    if (!create && err instanceof Error && err.name === "NotFoundError") return null;
    throw err;
  }
}

// --- Public API ---

/**
 * Local audio cache for a book: Map<chunkId, hash>. A single directory listing
 * answers all cache questions. Returns empty Map if the book has no cached audio.
 */
export async function audioLocal(bookId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const dir = await getBookDir(bookId, false);
  if (!dir) return map;
  for await (const name of dir.keys()) {
    const parsed = parseFileName(name);
    if (parsed) map.set(parsed.chunkId, parsed.hash);
  }
  return map;
}

/**
 * Reads a cached WAV. Returns null if not found or if the hash doesn't match
 * (stale audio for changed text).
 */
export async function readChunk(
  bookId: string,
  chunkId: string,
  hash: string,
): Promise<ArrayBuffer | null> {
  const dir = await getBookDir(bookId, false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(fileName(chunkId, hash));
    return await (await handle.getFile()).arrayBuffer();
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundError") return null;
    throw err;
  }
}

/**
 * Saves a WAV from the worker using a Sync Access Handle. Also cleans up stale
 * versions of the same chunk (old hash → orphaned file wasting quota).
 *
 * Must run inside a Worker — createSyncAccessHandle is worker-only.
 */
export async function saveChunk(
  bookId: string,
  chunkId: string,
  hash: string,
  wav: ArrayBuffer,
): Promise<void> {
  const dir = await getBookDir(bookId, true);
  if (!dir) throw new Error(`Could not create OPFS directory for book ${bookId}`);
  const name = fileName(chunkId, hash);
  const handle = await dir.getFileHandle(name, { create: true });
  // createSyncAccessHandle is worker-only — not in the DOM lib types.
  const access = await (
    handle as unknown as {
      createSyncAccessHandle: () => Promise<{
        truncate: (size: number) => void;
        write: (data: Uint8Array, options?: { at?: number }) => number;
        flush: () => void;
        close: () => void;
      }>;
    }
  ).createSyncAccessHandle();
  try {
    access.truncate(0);
    access.write(new Uint8Array(wav), { at: 0 });
    access.flush();
  } finally {
    access.close();
  }

  // Delete stale versions of this chunk (different hash).
  for await (const existing of dir.keys()) {
    const parsed = parseFileName(existing);
    if (parsed && parsed.chunkId === chunkId && existing !== name) {
      await dir.removeEntry(existing).catch(() => {});
    }
  }
}

/**
 * Deletes all audio for a book (keeps the text/metadata in IndexedDB). User-
 * triggered action to free space without losing the document.
 */
export async function deleteBookAudio(bookId: string): Promise<void> {
  dirCache.delete(bookId);
  const root = await navigator.storage.getDirectory();
  const libros = await root.getDirectoryHandle("libros").catch(() => null);
  await libros?.removeEntry(bookId, { recursive: true }).catch(() => {});
}

/** Bytes used by a book's cached audio on this device. */
export async function bookAudioSize(bookId: string): Promise<number> {
  const dir = await getBookDir(bookId, false);
  if (!dir) return 0;
  let total = 0;
  for await (const handle of dir.values()) {
    if (handle.kind === "file") total += (await handle.getFile()).size;
  }
  return total;
}

/**
 * Requests persistent storage so the browser doesn't evict OPFS under pressure.
 * Idempotent: returns true immediately if already granted.
 */
export function requestPersistence(): Promise<boolean> {
  return navigator.storage?.persist?.() ?? Promise.resolve(false);
}

/** Storage usage vs. quota, for the settings UI. */
export async function storageUsage(): Promise<{ used: number; quota: number; free: number }> {
  const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
  return { used: usage, quota, free: Math.max(0, quota - usage) };
}
