import { describe, it, expect } from "vitest";
import { LocalBookRepository } from "./LocalBookRepository";
import type { BookStore } from "./LocalBookRepository";
import type { Book, Bookmark, Chunk, Progress } from "../../types/book.ts";

function makeBook(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    titulo: `Book ${id}`,
    autor: null,
    formatoOriginal: "txt",
    totalChunks: 0,
    capitulos: [],
    fechaCreacion: 1000,
    fechaModificacion: 1000,
    ...overrides,
  };
}

function makeChunk(bookId: string, id: string, orden: number): Chunk {
  return {
    id,
    bookId,
    indiceOrden: orden,
    capituloId: null,
    texto: `text ${orden}`,
    voiceId: "v1",
  };
}

// In-memory BookStore so tests don't need IndexedDB (jsdom has none).
function memoryStore(): BookStore {
  const books = new Map<string, Book>();
  const chunks = new Map<string, Chunk>();
  const progress = new Map<string, Progress>();
  const bookmarks = new Map<string, Bookmark>();
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
      for (const [k] of chunks) if (k.startsWith(`chunk:${bookId}:`)) chunks.delete(k);
      progress.delete(bookId);
      for (const [k] of bookmarks) if (k.startsWith(`bookmark:${bookId}:`)) bookmarks.delete(k);
    },
    async getChunks(bookId) {
      return Array.from(chunks.values())
        .filter((c) => c.bookId === bookId)
        .sort((a, b) => a.indiceOrden - b.indiceOrden);
    },
    async setChunk(chunk) {
      chunks.set(`${chunk.bookId}:${chunk.id}`, chunk);
    },
    async getProgress(bookId) {
      return progress.get(bookId) ?? null;
    },
    async setProgress(p) {
      progress.set(p.bookId, p);
    },
    async getBookmarks(bookId) {
      return Array.from(bookmarks.values()).filter((b) => b.bookId === bookId);
    },
    async setBookmark(bm) {
      bookmarks.set(`${bm.bookId}:${bm.id}`, bm);
    },
    async deleteBookmark(bookId, bookmarkId) {
      bookmarks.delete(`${bookId}:${bookmarkId}`);
    },
  };
}

describe("LocalBookRepository", () => {
  it("saveBook + getBook round-trips", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const book = makeBook("b1");
    await repo.saveBook(book);
    expect(await repo.getBook("b1")).toEqual(book);
  });

  it("getBook returns null for unknown id", async () => {
    const repo = new LocalBookRepository(memoryStore());
    expect(await repo.getBook("nope")).toBeNull();
  });

  it("onBooks fires immediately and on changes, sorted by fechaModificacion", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const seen: Book[][] = [];
    const unsub = repo.onBooks((books) => seen.push(books));

    await repo.saveBook(makeBook("b1", { fechaModificacion: 2000 }));
    await repo.saveBook(makeBook("b2", { fechaModificacion: 1000 }));
    // Most recent first: b1 (2000) before b2 (1000)
    const last = seen.at(-1)!;
    expect(last.map((b) => b.id)).toEqual(["b1", "b2"]);
    unsub();
  });

  it("deleteBook removes the book and notifies listeners", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const seen: Book[][] = [];
    repo.onBooks((books) => seen.push(books));
    await repo.saveBook(makeBook("b1"));
    await repo.deleteBook("b1");
    expect(await repo.getBook("b1")).toBeNull();
    expect(seen.at(-1)!).toEqual([]);
  });

  it("renameBook updates the title and bumps fechaModificacion", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const seen: Book[][] = [];
    repo.onBooks((books) => seen.push(books));
    await repo.saveBook(makeBook("b1", { titulo: "Old title", fechaModificacion: 1000 }));
    await repo.renameBook("b1", "New title");
    const book = await repo.getBook("b1");
    expect(book?.titulo).toBe("New title");
    expect(book?.fechaModificacion).toBeGreaterThan(1000);
    expect(seen.at(-1)![0]?.titulo).toBe("New title");
  });

  it("renameBook does nothing for an unknown id", async () => {
    const repo = new LocalBookRepository(memoryStore());
    await expect(repo.renameBook("missing", "Anything")).resolves.toBeUndefined();
  });

  it("saveChunks stores and onChunks returns them ordered", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const seen: Chunk[][] = [];
    repo.onChunks("b1", (chunks) => seen.push(chunks));
    // Save out of order — listener should still receive ordered
    await repo.saveChunks("b1", [makeChunk("b1", "c2", 2), makeChunk("b1", "c1", 1)]);
    expect(seen.at(-1)!.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("saveProgress + getProgress round-trips", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const p: Progress = {
      bookId: "b1",
      chunkActualId: "c1",
      offsetSegundos: 5.5,
      fechaUltimaEscucha: 9000,
    };
    await repo.saveProgress(p);
    expect(await repo.getProgress("b1")).toEqual(p);
  });

  it("saveProgress overwrites previous progress (last-write-wins)", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const p1: Progress = {
      bookId: "b1",
      chunkActualId: "c0001",
      offsetSegundos: 3.0,
      fechaUltimaEscucha: 1000,
    };
    await repo.saveProgress(p1);

    const p2: Progress = {
      bookId: "b1",
      chunkActualId: "c0005",
      offsetSegundos: 12.7,
      fechaUltimaEscucha: 2000,
    };
    await repo.saveProgress(p2);

    const loaded = await repo.getProgress("b1");
    expect(loaded).toEqual(p2);
  });

  it("getProgress returns null for a book with no saved progress", async () => {
    const repo = new LocalBookRepository(memoryStore());
    expect(await repo.getProgress("no-such-book")).toBeNull();
  });

  it("saveBookmark + getBookmarks + deleteBookmark", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const bm: Bookmark = {
      id: "m1",
      bookId: "b1",
      chunkId: "c1",
      offsetSegundos: 3,
      nombre: "Ch1",
      createdAt: 100,
    };
    await repo.saveBookmark(bm);
    expect(await repo.getBookmarks("b1")).toEqual([bm]);
    await repo.deleteBookmark("b1", "m1");
    expect(await repo.getBookmarks("b1")).toEqual([]);
  });

  it("onBooks and onChunks unsubscribe correctly", async () => {
    const repo = new LocalBookRepository(memoryStore());
    let bookCalls = 0;
    const unsubBooks = repo.onBooks(() => bookCalls++);
    let chunkCalls = 0;
    const unsubChunks = repo.onChunks("b1", () => chunkCalls++);

    // Initial push counts as 1 each
    await repo.saveBook(makeBook("b1"));
    expect(bookCalls).toBeGreaterThanOrEqual(2);
    await repo.saveChunks("b1", [makeChunk("b1", "c1", 1)]);
    expect(chunkCalls).toBeGreaterThanOrEqual(2);

    unsubBooks();
    unsubChunks();
    const bookCallsBefore = bookCalls;
    const chunkCallsBefore = chunkCalls;
    await repo.saveBook(makeBook("b2"));
    await repo.saveChunks("b1", [makeChunk("b1", "c2", 2)]);
    expect(bookCalls).toBe(bookCallsBefore);
    expect(chunkCalls).toBe(chunkCallsBefore);
  });
});
