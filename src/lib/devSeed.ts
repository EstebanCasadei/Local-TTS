import { getBookRepository } from "./books/index.ts";
import type { Book } from "../types/book.ts";

// ponytail: seed temporal para visualizar la LibraryPage con documentos.
// Se dispara solo en dev y si aún no hay libros reales; quitar una vez el
// flujo de carga de archivos esté listo.
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
