import { chunkText } from "../chunker.ts";
import type { Book, Chunk } from "../../types/book.ts";
import type { BookRepository } from "./BookRepository.ts";

// Shown to brand-new users so the library isn't empty on first launch, and so
// there's something to try listening to right away without uploading a file
// first. Seeded once — if the user deletes it, it must not come back.
const DEFAULT_BOOK_ID = "local-tts-welcome";
const SEEDED_FLAG_KEY = "local-tts:seeded-default-book";

const DEFAULT_BOOK_TITLE = "Bienvenido a LocalTTS";

const DEFAULT_BOOK_TEXT = `Leer cansa la vista, sobre todo después de horas frente a una pantalla. Escuchar, en cambio, te deja las manos libres y los ojos descansados: podés aprovechar el viaje en colectivo, cocinar, salir a caminar o simplemente tirarte a descansar sin perder el hilo de lo que tenías pendiente. No hace falta sentarte, ni tener buena luz, ni encontrar el momento "ideal" para leer; el contenido te acompaña mientras hacés otra cosa. Ahora no hay excusas para dejar ese contenido por falta de tiempo, cuando simplemente podés escucharlo.

Y esa comodidad no debería depender de cuánto puedas pagar. Por eso armamos LocalTTS: subís tu documento, elegís qué escuchar, y listo; sin límites de minutos, sin suscripción, y con el procesamiento corriendo en tu propio dispositivo.`;

// Narrow port for the "already seeded" flag, injectable so this is testable
// without depending on a real localStorage (jsdom doesn't provide one by
// default — same reasoning as BookStore/LocalUserStore elsewhere).
export interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultFlagStore: FlagStore = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore — worst case we try to seed again next load.
    }
  },
};

/**
 * Seeds a default "welcome" document once per browser, so a new user has
 * something to listen to immediately. No-ops if it was already seeded before
 * (even if the user since deleted it) or if the library already has books.
 */
export async function seedDefaultBookIfNeeded(
  repo: BookRepository,
  flagStore: FlagStore = defaultFlagStore,
): Promise<void> {
  const hasSeeded = flagStore.getItem(SEEDED_FLAG_KEY) === "1";
  const markSeeded = () => flagStore.setItem(SEEDED_FLAG_KEY, "1");

  if (hasSeeded) return;

  const existing = await repo.getBook(DEFAULT_BOOK_ID);
  if (existing) {
    markSeeded();
    return;
  }

  const now = Date.now();
  const chunks: Chunk[] = chunkText(DEFAULT_BOOK_TEXT).map((texto, i) => ({
    id: `c${String(i).padStart(4, "0")}`,
    bookId: DEFAULT_BOOK_ID,
    indiceOrden: i,
    capituloId: 0,
    texto,
    voiceId: "es_ES-davefx-medium",
  }));

  const book: Book = {
    id: DEFAULT_BOOK_ID,
    titulo: DEFAULT_BOOK_TITLE,
    autor: "LocalTTS",
    formatoOriginal: "txt",
    totalChunks: chunks.length,
    capitulos: [{ indice: 0, titulo: DEFAULT_BOOK_TITLE }],
    fechaCreacion: now,
    fechaModificacion: now,
  };

  await repo.saveBook(book);
  await repo.saveChunks(DEFAULT_BOOK_ID, chunks);
  markSeeded();
}
