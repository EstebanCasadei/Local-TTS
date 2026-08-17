import { getBookRepository } from "./books/index.ts";
import type { Book } from "../types/book.ts";

// --- TEMPORARY DEVELOPMENT SEED ---
//
// The books shown in LibraryPage when you run `pnpm dev` are fake data
// created only to preview the populated UI before the real upload/extract
// pipeline exists (#7/#8/#9).
//
// Files involved:
//   - src/lib/devSeed.ts   (this file: defines the seed data)
//   - src/main.tsx         (calls seedDev() only in dev)
//   - src/components/library/* (ContinueCard, BookRow, shared.tsx)
//   - src/pages/LibraryPage.tsx
//
// How to remove the seeded books:
//   1. Clear the localStorage flag: `localStorage.removeItem("dev:library-seeded")`
//   2. Clear the book repository in IndexedDB (Application > IndexedDB
//      > local-tts-db > books, or use DevTools > Application > Storage > Clear
//      site data).
//   3. Reload the page.
//
// To disable the seed entirely, remove the `seedDev()` call from
// src/main.tsx. Delete this file once document upload is real.
// ---
export async function seedDev(): Promise<void> {
  if (import.meta.env.PROD || localStorage.getItem("dev:library-seeded")) {
    return;
  }

  const repo = getBookRepository();
  const books: Book[] = [
    {
      id: "seed-1",
      titulo: "Q3 Market Analysis & Strategy Overview",
      autor: null,
      formatoOriginal: "pdf",
      totalChunks: 80,
      capitulos: [],
      fechaCreacion: new Date("2025-10-12").getTime(),
      fechaModificacion: new Date().getTime(),
    },
    {
      id: "seed-2",
      titulo: "Annual Financial Report FY23",
      autor: null,
      formatoOriginal: "pdf",
      totalChunks: 45,
      capitulos: [],
      fechaCreacion: new Date("2025-10-12").getTime(),
      fechaModificacion: new Date("2025-10-10").getTime(),
    },
    {
      id: "seed-3",
      titulo: "Machine Learning Ethics Whitepaper",
      autor: null,
      formatoOriginal: "epub",
      totalChunks: 60,
      capitulos: [],
      fechaCreacion: new Date("2025-10-12").getTime(),
      fechaModificacion: new Date("2025-10-08").getTime(),
    },
  ];

  const existing = await new Promise<Book[]>((resolve) => {
    const off = repo.onBooks((list) => {
      off();
      resolve(list);
    });
  });

  if (existing.length > 0) return;

  for (const book of books) {
    await repo.saveBook(book);
  }
  localStorage.setItem("dev:library-seeded", "true");
}
