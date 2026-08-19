// Data shapes for the local-first book layer. Modeled on the PoC's sync.js
// (guardarLibro / guardarChunks / guardarProgreso) with the chunk-tone fields
// from guardarTono. Audio is deliberately NOT here — audio lives in OPFS (#6),
// keyed by chunk hash; Firestore sync (#18) never touches it.

export type DocumentFormat = "txt" | "pdf" | "epub";

// Serializable timestamp — epoch ms as a number. Firestore sync (#18) will
// convert to/from serverTimestamp() at the boundary; the interface stays
// platform-neutral so local and synced modes share one type.
export type EpochTimestamp = number;

export interface Book {
  id: string;
  titulo: string;
  autor: string | null;
  formatoOriginal: DocumentFormat;
  totalChunks: number;
  capitulos: { indice: number; titulo: string }[];
  fechaCreacion: EpochTimestamp;
  fechaModificacion: EpochTimestamp;
}

export interface Chunk {
  id: string; // chunkId, stable per book
  bookId: string;
  indiceOrden: number;
  capituloId: number | null;
  texto: string;
  voiceId: string;
  // Filled in after synthesis (from the worker); absent until then.
  toneCategoria?: string;
  synthesisParams?: Record<string, number>;
}

export interface Progress {
  bookId: string;
  chunkActualId: string;
  /** Global playback position in seconds — used for library display. */
  offsetSegundos: number;
  /** Offset within the chunk in seconds — used for word-level resume. */
  offsetLocal?: number;
  fechaUltimaEscucha: EpochTimestamp;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chunkId: string;
  offsetSegundos: number;
  nombre: string | null;
  createdAt: EpochTimestamp;
}
