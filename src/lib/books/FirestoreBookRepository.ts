import type { Book, Bookmark, Chunk, Progress } from "../../types/book.ts";
import type { BookRepository } from "./BookRepository";

// Stub for the Firestore sync strategy. Full implementation is #18's main body
// (needs #7 for chunk text to sync). Methods throw "not implemented" so the
// facade can wire it in but any call surfaces clearly that it's not ready yet.
//
// The real implementation will wrap firebase/firestore (setDoc, onSnapshot,
// writeBatch) against users/{uid}/libros/{libroId} paths, reusing the PoC's
// sync.js patterns: fire-and-forget writes, live listeners, 500-op batch limit.
export class FirestoreBookRepository implements BookRepository {
  private notImplemented(method: string): never {
    throw new Error(
      `FirestoreBookRepository.${method}: not implemented yet — full Firestore sync is #18's main body`,
    );
  }

  saveBook(_book: Book): Promise<void> {
    return Promise.resolve(this.notImplemented("saveBook"));
  }
  getBook(_bookId: string): Promise<Book | null> {
    return Promise.resolve(this.notImplemented("getBook"));
  }
  onBooks(_cb: (books: Book[]) => void): () => void {
    this.notImplemented("onBooks");
  }
  deleteBook(_bookId: string): Promise<void> {
    return Promise.resolve(this.notImplemented("deleteBook"));
  }
  renameBook(_bookId: string, _title: string): Promise<void> {
    return Promise.resolve(this.notImplemented("renameBook"));
  }
  saveChunks(_bookId: string, _chunks: Chunk[]): Promise<void> {
    return Promise.resolve(this.notImplemented("saveChunks"));
  }
  onChunks(_bookId: string, _cb: (chunks: Chunk[]) => void): () => void {
    this.notImplemented("onChunks");
  }
  saveProgress(_progress: Progress): Promise<void> {
    return Promise.resolve(this.notImplemented("saveProgress"));
  }
  getProgress(_bookId: string): Promise<Progress | null> {
    return Promise.resolve(this.notImplemented("getProgress"));
  }
  saveBookmark(_bookmark: Bookmark): Promise<void> {
    return Promise.resolve(this.notImplemented("saveBookmark"));
  }
  getBookmarks(_bookId: string): Promise<Bookmark[]> {
    return Promise.resolve(this.notImplemented("getBookmarks"));
  }
  deleteBookmark(_bookId: string, _bookmarkId: string): Promise<void> {
    return Promise.resolve(this.notImplemented("deleteBookmark"));
  }
}
