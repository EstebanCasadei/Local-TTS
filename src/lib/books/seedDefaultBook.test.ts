import { describe, it, expect } from "vitest";
import { seedDefaultBookIfNeeded, type FlagStore } from "./seedDefaultBook.ts";
import { LocalBookRepository, type BookStore } from "./LocalBookRepository";
import type { Book, Chunk } from "../../types/book.ts";

function getChunksOnce(repo: LocalBookRepository, bookId: string): Promise<Chunk[]> {
  return new Promise((resolve) => {
    const unsub = repo.onChunks(bookId, (chunks) => {
      unsub();
      resolve(chunks);
    });
  });
}

// In-memory FlagStore so tests don't depend on a real localStorage (jsdom
// doesn't provide one by default — same reasoning as the in-memory BookStore).
function memoryFlagStore(): FlagStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function memoryStore(): BookStore {
  const books = new Map<string, Book>();
  const chunks = new Map<string, Chunk>();
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
      for (const [k] of chunks) if (k.startsWith(`${bookId}:`)) chunks.delete(k);
    },
    async getChunks(bookId) {
      return Array.from(chunks.values()).filter((c) => c.bookId === bookId);
    },
    async setChunk(chunk) {
      chunks.set(`${chunk.bookId}:${chunk.id}`, chunk);
    },
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

describe("seedDefaultBookIfNeeded", () => {
  it("creates the welcome book on first run", async () => {
    const repo = new LocalBookRepository(memoryStore());
    await seedDefaultBookIfNeeded(repo, memoryFlagStore());

    const book = await repo.getBook("local-tts-welcome");
    expect(book).not.toBeNull();
    expect(book?.titulo).toBe("Bienvenido a LocalTTS");

    const chunks = await getChunksOnce(repo, "local-tts-welcome");
    expect(chunks.length).toBeGreaterThan(0);
    expect(book?.totalChunks).toBe(chunks.length);
  });

  it("does not run twice, even if the book is deleted afterward", async () => {
    const repo = new LocalBookRepository(memoryStore());
    const flagStore = memoryFlagStore();
    await seedDefaultBookIfNeeded(repo, flagStore);
    await repo.deleteBook("local-tts-welcome");

    await seedDefaultBookIfNeeded(repo, flagStore);
    expect(await repo.getBook("local-tts-welcome")).toBeNull();
  });

  it("does not duplicate the book if already present without the flag set", async () => {
    const repo = new LocalBookRepository(memoryStore());
    await seedDefaultBookIfNeeded(repo, memoryFlagStore());
    const firstChunks = await getChunksOnce(repo, "local-tts-welcome");

    // Simulate the flag missing (e.g. cleared localStorage) but the book
    // already existing — shouldn't recreate/duplicate chunks.
    await seedDefaultBookIfNeeded(repo, memoryFlagStore());

    const chunksAfter = await getChunksOnce(repo, "local-tts-welcome");
    expect(chunksAfter.length).toBe(firstChunks.length);
  });
});
