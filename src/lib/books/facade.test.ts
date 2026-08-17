import { describe, it, expect, vi } from "vitest";

// Force "Firebase not configured" so the books facade stays local-only and the
// onFirstSync from the user module never fires. This keeps the facade test
// hermetic — no live Firebase, no IndexedDB (in-memory store injected).
vi.mock("../firebase", () => ({
  firebaseConfigured: false,
  getFirebase: () => null,
}));

import { BookRepositoryFacade } from "./facade";
import { LocalBookRepository, type BookStore } from "./LocalBookRepository";
import type { Book } from "../../types/book.ts";

function makeBook(id: string): Book {
  return {
    id,
    titulo: `Book ${id}`,
    autor: null,
    formatoOriginal: "txt",
    totalChunks: 0,
    capitulos: [],
    fechaCreacion: 1000,
    fechaModificacion: 1000,
  };
}

function memoryStore(): BookStore {
  const books = new Map<string, Book>();
  return {
    async getBook(id) {
      return books.get(id) ?? null;
    },
    async setBook(book) {
      books.set(book.id, book);
    },
    async getAllBooks() {
      return Array.from(books.values());
    },
    async deleteBookRecords(bookId) {
      books.delete(bookId);
    },
    async getChunks() {
      return [];
    },
    async setChunk() {},
    async getProgress() {
      return null;
    },
    async setProgress() {},
    async getBookmarks() {
      return [];
    },
    async setBookmark() {},
    async deleteBookmark() {},
  };
}

describe("BookRepositoryFacade (local-only)", () => {
  it("delegates to LocalBookRepository by default", async () => {
    const store = memoryStore();
    const facade = new BookRepositoryFacade(store);
    await facade.saveBook(makeBook("b1"));
    expect((await facade.getBook("b1"))?.id).toBe("b1");
  });

  it("startSync swaps the active strategy", async () => {
    const store = memoryStore();
    const facade = new BookRepositoryFacade(store);
    await facade.saveBook(makeBook("b1"));

    // Swap to a stub repo that returns a fixed book list
    const stub = new LocalBookRepository(memoryStore());
    await stub.saveBook(makeBook("stub-book"));
    facade.startSync(stub);

    // onBooks pushes asynchronously (initial getAllBooks), so wait a tick.
    const books = await new Promise<Book[]>((resolve) => {
      facade.onBooks((b) => resolve(b));
    });
    expect(books.some((b) => b.id === "stub-book")).toBe(true);
  });

  it("backfillFromLocal copies local books into the active repo", async () => {
    const localStore = memoryStore();
    await localStore.setBook(makeBook("b1"));
    await localStore.setBook(makeBook("b2"));

    const targetStore = memoryStore();
    const target = new LocalBookRepository(targetStore);
    const facade = new BookRepositoryFacade(memoryStore());
    facade.startSync(target);

    await facade.backfillFromLocal(localStore);
    expect(await target.getBook("b1")).not.toBeNull();
    expect(await target.getBook("b2")).not.toBeNull();
  });

  it("works without firing onFirstSync when unconfigured", async () => {
    const store = memoryStore();
    const facade = new BookRepositoryFacade(store);
    // The onFirstSync subscription is wired in index.ts, not in the facade
    // constructor. When unconfigured, it never fires. Just ensure the facade
    // constructs and works.
    await facade.saveBook(makeBook("b1"));
    expect((await facade.getBook("b1"))?.id).toBe("b1");
  });
});
