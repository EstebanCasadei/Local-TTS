// Shared types for document extraction.
// Ported from the PoC (src/lib/extract/types.js + src/lib/textCleanup.js shapes).
// All extractors return RawDocument; clean() converts it to ExtractedDocument.

/** A block of text with optional provenance (page number for PDF, href for EPUB). */
export interface TextBlock {
  text: string;
  page?: number;
  href?: string;
}

/** A raw chapter before cleanup: title + blocks with provenance. */
export interface RawChapter {
  title: string | null;
  blocks: TextBlock[];
}

/** What every extractor returns, before text cleanup runs. */
export interface RawDocument {
  kind: "txt" | "pdf" | "epub";
  fileName: string;
  bytes: number;
  meta: {
    title?: string;
    author?: string;
  };
  warnings: Warning[];
  chapters: RawChapter[];
}

/** Source metadata for a cleaned chapter. */
export interface ChapterSource {
  pages?: [number, number];
  hrefs?: string[];
}

/** A cleaned chapter: text is ready for TTS, provenance is summarized. */
export interface Chapter {
  index: number;
  title: string;
  text: string;
  chars: number;
  source: ChapterSource;
}

/** Progress reported by extractDocument/extractors during a long-running extraction. */
export interface ExtractProgress {
  phase: "reading" | "pages" | "chapters" | "cleaning";
  done: number;
  total: number;
}

/** What clean() produces — the final document the rest of the app uses. */
export interface ExtractedDocument {
  kind: "txt" | "pdf" | "epub";
  fileName: string;
  title: string;
  chapters: Chapter[];
  meta: {
    title?: string;
    author?: string;
  };
  warnings: Warning[];
}

export interface Warning {
  code: string;
  message: string;
}

export const ErrorCode = {
  UNSUPPORTED_TYPE: "UNSUPPORTED_TYPE",
  EMPTY_DOCUMENT: "EMPTY_DOCUMENT",
  PARSE_ERROR: "PARSE_ERROR",
  CORRUPT_FILE: "CORRUPT_FILE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_TYPE: "Tipo de archivo no soportado",
  EMPTY_DOCUMENT: "El documento no tiene texto",
  PARSE_ERROR: "Error al procesar el documento",
  CORRUPT_FILE: "El archivo está corrupto o no se puede leer",
};

export class ExtractionError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.code = code;
    this.name = "ExtractionError";
  }
}
