import type { BookRepository } from "./BookRepository";
import { BookRepositoryFacade } from "./facade";
import { defaultBookStore } from "./LocalBookRepository";
import { seedDefaultBookIfNeeded } from "./seedDefaultBook.ts";
import { onFirstSync } from "../user";

// Public API (frontend + #18):
//   useLibrary() / useBook()      — React hooks (frontend)
//   getBookRepository()           — the singleton facade
//   startFirestoreSync(repo)      — #18 calls this to plug in the real Firestore impl

export type {
  Book,
  Bookmark,
  Chunk,
  Progress,
  DocumentFormat,
  EpochTimestamp,
} from "../../types/book.ts";
export type { BookRepository } from "./BookRepository";
export type { BookStore } from "./LocalBookRepository";
export type { BookRepositoryFacade } from "./facade";

let _repo: BookRepositoryFacade | null = null;

export function getBookRepository(): BookRepositoryFacade {
  if (!_repo) {
    _repo = new BookRepositoryFacade(defaultBookStore);
    // Subscribe to firstSync: when the user opts in, backfill local data.
    // The Firestore repo swap happens when #18 calls startFirestoreSync().
    onFirstSync(() => {
      void _repo?.backfillFromLocal(defaultBookStore);
    });
    // First-launch only: gives new users something to listen to right away
    // without having to upload a document first.
    void seedDefaultBookIfNeeded(_repo);
  }
  return _repo;
}

/** #18 calls this to replace the stub with the real Firestore implementation. */
export function startFirestoreSync(repo: BookRepository): void {
  getBookRepository().startSync(repo);
}

/** Convenience for callers that only need the base interface. */
export function asBookRepository(): BookRepository {
  return getBookRepository();
}
