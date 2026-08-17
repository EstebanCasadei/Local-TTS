import type { Book, Bookmark, Chunk, Progress } from "../../types/book.ts";
import type { BookRepository } from "./BookRepository";
import { LocalBookRepository, defaultBookStore, type BookStore } from "./LocalBookRepository";

// Same Strategy + Facade treatment as the user module (#38). Holds
// LocalBookRepository by default (zero network), and swaps to
// FirestoreBookRepository when the user opts into sync. The swap + backfill are
// triggered by onFirstSync from the user facade — this facade stays about data,
// #38 stays about identity.
//
// For this sub-issue (#41), the Firestore strategy is a stub. When #18's main
// body lands, the real FirestoreBookRepository plugs in here with no changes to
// the facade or to any frontend consumer.
export class BookRepositoryFacade implements BookRepository {
  private active: BookRepository;

  // bookStore is injectable so the facade is unit-testable without IndexedDB
  // (jsdom has none). The onFirstSync subscription is wired in index.ts, not
  // here, so the facade stays focused on strategy swap + delegation.
  constructor(bookStore: BookStore = defaultBookStore) {
    this.active = new LocalBookRepository(bookStore);
  }

  /** Swap to Firestore + wire the backfill trigger. Called by index.ts. */
  startSync(firestoreRepo: BookRepository): void {
    this.active = firestoreRepo;
  }

  /** Backfill local data into the active (Firestore) repo. Called on firstSync. */
  async backfillFromLocal(localStore: BookStore): Promise<void> {
    const books = await localStore.getAllBooks();
    for (const book of books) {
      await this.active.saveBook(book);
      const chunks = await localStore.getChunks(book.id);
      await this.active.saveChunks(book.id, chunks);
      const progress = await localStore.getProgress(book.id);
      if (progress) await this.active.saveProgress(progress);
      const bookmarks = await localStore.getBookmarks(book.id);
      for (const bm of bookmarks) await this.active.saveBookmark(bm);
    }
  }

  getUser(): BookRepository {
    return this.active;
  }

  // --- BookRepository: delegate to active strategy ---

  saveBook(book: Book): Promise<void> {
    return this.active.saveBook(book);
  }
  getBook(bookId: string): Promise<Book | null> {
    return this.active.getBook(bookId);
  }
  onBooks(cb: (books: Book[]) => void): () => void {
    return this.active.onBooks(cb);
  }
  deleteBook(bookId: string): Promise<void> {
    return this.active.deleteBook(bookId);
  }
  saveChunks(bookId: string, chunks: Chunk[]): Promise<void> {
    return this.active.saveChunks(bookId, chunks);
  }
  onChunks(bookId: string, cb: (chunks: Chunk[]) => void): () => void {
    return this.active.onChunks(bookId, cb);
  }
  saveProgress(progress: Progress): Promise<void> {
    return this.active.saveProgress(progress);
  }
  getProgress(bookId: string): Promise<Progress | null> {
    return this.active.getProgress(bookId);
  }
  saveBookmark(bookmark: Bookmark): Promise<void> {
    return this.active.saveBookmark(bookmark);
  }
  getBookmarks(bookId: string): Promise<Bookmark[]> {
    return this.active.getBookmarks(bookId);
  }
  deleteBookmark(bookId: string, bookmarkId: string): Promise<void> {
    return this.active.deleteBookmark(bookId, bookmarkId);
  }
}
