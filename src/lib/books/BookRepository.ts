import type { Book, Bookmark, Chunk, Progress } from "../../types/book.ts";

// The public contract the frontend and #18 consume. Works identically in
// local-only and synced modes — the facade decides which implementation is
// active. The frontend never branches on where data lives.
//
// Write methods are fire-and-forget in spirit (the PoC's sinBloquear pattern):
// they resolve when the local cache is updated, and the Firestore impl (#18)
// resolves on local-cache write while the server sync happens in the background.
// Listeners (onBooks / onChunks) push updates reactively.
export interface BookRepository {
  // --- Books ---
  saveBook(book: Book): Promise<void>;
  getBook(bookId: string): Promise<Book | null>;
  /** Live list of all books. Returns unsubscribe. */
  onBooks(cb: (books: Book[]) => void): () => void;
  deleteBook(bookId: string): Promise<void>;
  renameBook(bookId: string, title: string): Promise<void>;

  // --- Chunks ---
  saveChunks(bookId: string, chunks: Chunk[]): Promise<void>;
  /** Live, ordered list of chunks for a book. Returns unsubscribe. */
  onChunks(bookId: string, cb: (chunks: Chunk[]) => void): () => void;

  // --- Progress ---
  saveProgress(progress: Progress): Promise<void>;
  getProgress(bookId: string): Promise<Progress | null>;

  // --- Bookmarks (#15) ---
  saveBookmark(bookmark: Bookmark): Promise<void>;
  getBookmarks(bookId: string): Promise<Bookmark[]>;
  deleteBookmark(bookId: string, bookmarkId: string): Promise<void>;
}
