import type { Book, Bookmark, Chunk, Progress } from "../../types/book.ts";
import type { BookRepository } from "./BookRepository";

// Narrow storage port so LocalBookRepository is unit-testable without IndexedDB
// (jsdom has none). The IndexedDB-backed implementation is the default; tests
// inject an in-memory one.
export interface BookStore {
  getBook(bookId: string): Promise<Book | null>;
  setBook(book: Book): Promise<void>;
  getAllBooks(): Promise<Book[]>;
  deleteBookRecords(bookId: string): Promise<void>;

  getChunks(bookId: string): Promise<Chunk[]>;
  setChunk(chunk: Chunk): Promise<void>;

  getProgress(bookId: string): Promise<Progress | null>;
  setProgress(progress: Progress): Promise<void>;

  getBookmarks(bookId: string): Promise<Bookmark[]>;
  setBookmark(bookmark: Bookmark): Promise<void>;
  deleteBookmark(bookId: string, bookmarkId: string): Promise<void>;
}

// --- Composite key helpers (shared by IndexedDB + in-memory stores) ---

const bookKey = (id: string) => `book:${id}`;
const chunkKey = (bookId: string, chunkId: string) => `chunk:${bookId}:${chunkId}`;
const progressKey = (bookId: string) => `progress:${bookId}`;
const bookmarkKey = (bookId: string, bookmarkId: string) => `bookmark:${bookId}:${bookmarkId}`;

export const keys = { bookKey, chunkKey, progressKey, bookmarkKey };

// IndexedDB-backed store. Uses the "books" object store in localDb.ts with
// composite string keys for range queries (all chunks of a book, etc.).
import { booksGet, booksGetByPrefix, booksSet, booksDelete, booksDeleteByPrefix } from "../localDb";

export const defaultBookStore: BookStore = {
  async getBook(bookId) {
    return (await booksGet<Book>(bookKey(bookId))) ?? null;
  },
  async setBook(book) {
    await booksSet(bookKey(book.id), book);
  },
  async getAllBooks() {
    return booksGetByPrefix<Book>("book:");
  },
  async deleteBookRecords(bookId) {
    // Delete the book doc + all chunks/progress/bookmarks under it.
    await booksDeleteByPrefix(`chunk:${bookId}:`);
    await booksDeleteByPrefix(`bookmark:${bookId}:`);
    await booksDelete(progressKey(bookId));
    await booksDelete(bookKey(bookId));
  },
  async getChunks(bookId) {
    const chunks = await booksGetByPrefix<Chunk>(`chunk:${bookId}:`);
    return chunks.sort((a, b) => a.indiceOrden - b.indiceOrden);
  },
  async setChunk(chunk) {
    await booksSet(chunkKey(chunk.bookId, chunk.id), chunk);
  },
  async getProgress(bookId) {
    return (await booksGet<Progress>(progressKey(bookId))) ?? null;
  },
  async setProgress(progress) {
    await booksSet(progressKey(progress.bookId), progress);
  },
  async getBookmarks(bookId) {
    return booksGetByPrefix<Bookmark>(`bookmark:${bookId}:`);
  },
  async setBookmark(bookmark) {
    await booksSet(bookmarkKey(bookmark.bookId, bookmark.id), bookmark);
  },
  async deleteBookmark(bookId, bookmarkId) {
    await booksDelete(bookmarkKey(bookId, bookmarkId));
  },
};

// Local-first BookRepository. Backed by IndexedDB via the injectable BookStore
// port. This is the default strategy; the facade swaps to FirestoreBookRepository
// when the user opts into sync. No network calls — all data stays on-device.
export class LocalBookRepository implements BookRepository {
  private readonly bookListeners = new Set<(books: Book[]) => void>();
  private readonly chunkListeners = new Map<string, Set<(chunks: Chunk[]) => void>>();
  private readonly store: BookStore;

  constructor(store: BookStore = defaultBookStore) {
    this.store = store;
  }

  async saveBook(book: Book): Promise<void> {
    await this.store.setBook(book);
    await this.notifyBooks();
  }

  async getBook(bookId: string): Promise<Book | null> {
    return this.store.getBook(bookId);
  }

  onBooks(cb: (books: Book[]) => void): () => void {
    this.bookListeners.add(cb);
    // Push current state immediately.
    this.store
      .getAllBooks()
      .then((books) => cb(books.sort((a, b) => b.fechaModificacion - a.fechaModificacion)));
    return () => {
      this.bookListeners.delete(cb);
    };
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.store.deleteBookRecords(bookId);
    await this.notifyBooks();
    this.notifyChunks(bookId, []);
  }

  async saveChunks(bookId: string, chunks: Chunk[]): Promise<void> {
    for (const chunk of chunks) await this.store.setChunk(chunk);
    const all = await this.store.getChunks(bookId);
    this.notifyChunks(bookId, all);
  }

  onChunks(bookId: string, cb: (chunks: Chunk[]) => void): () => void {
    let set = this.chunkListeners.get(bookId);
    if (!set) {
      set = new Set();
      this.chunkListeners.set(bookId, set);
    }
    set.add(cb);
    this.store.getChunks(bookId).then(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.chunkListeners.delete(bookId);
    };
  }

  async saveProgress(progress: Progress): Promise<void> {
    await this.store.setProgress(progress);
  }

  async getProgress(bookId: string): Promise<Progress | null> {
    return this.store.getProgress(bookId);
  }

  async saveBookmark(bookmark: Bookmark): Promise<void> {
    await this.store.setBookmark(bookmark);
  }

  async getBookmarks(bookId: string): Promise<Bookmark[]> {
    return this.store.getBookmarks(bookId);
  }

  async deleteBookmark(bookId: string, bookmarkId: string): Promise<void> {
    await this.store.deleteBookmark(bookId, bookmarkId);
  }

  private async notifyBooks(): Promise<void> {
    const books = (await this.store.getAllBooks()).sort(
      (a, b) => b.fechaModificacion - a.fechaModificacion,
    );
    this.bookListeners.forEach((cb) => cb(books));
  }

  private notifyChunks(bookId: string, chunks: Chunk[]): void {
    const set = this.chunkListeners.get(bookId);
    set?.forEach((cb) => cb(chunks));
  }
}
