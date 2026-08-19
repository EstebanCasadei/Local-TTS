// Extraction router: dispatches by file extension (and mimetype as fallback).
// All extractors return the same shape (RawDocument) and the result always
// passes through clean(), so the rest of the app never branches by format.
//
// Ported from the PoC (src/lib/extract/index.js). PDF (#8) is lazy-loaded —
// pdfjs-dist only downloads if the user opens a PDF. EPUB (#9) is still a stub.

import { clean } from "../textCleanup";
import {
  ErrorCode,
  ExtractionError,
  type ExtractedDocument,
  type ExtractProgress,
  type RawDocument,
} from "./types";
import { extractTxt } from "./txt";

export { ErrorCode, ExtractionError, ERROR_MESSAGES } from "./types";
export { clean, fullText } from "../textCleanup";
export type {
  Chapter,
  ChapterSource,
  ExtractedDocument,
  ExtractProgress,
  RawChapter,
  RawDocument,
  TextBlock,
  Warning,
} from "./types";

const BY_EXTENSION: Record<string, "txt" | "pdf" | "epub"> = {
  txt: "txt",
  text: "txt",
  md: "txt",
  pdf: "pdf",
  epub: "epub",
};

const BY_MIME: Record<string, "txt" | "pdf" | "epub"> = {
  "text/plain": "txt",
  "text/markdown": "txt",
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
};

export const ACCEPT_ATTRIBUTE =
  ".txt,.md,.pdf,.epub,text/plain,application/pdf,application/epub+zip";

/** Detects the file kind by extension, falling back to mimetype. */
export function detectKind(file: File): "txt" | "pdf" | "epub" {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const kind = BY_EXTENSION[extension] ?? BY_MIME[file.type];
  if (!kind) {
    throw new ExtractionError(
      ErrorCode.UNSUPPORTED_TYPE,
      `${file.name} (${file.type || "sin mimetype"})`,
    );
  }
  return kind;
}

/**
 * Extracts and cleans a document. Dispatches to the right extractor by file
 * type, then runs the result through the text cleanup pipeline.
 */
export async function extractDocument(
  file: File,
  { onProgress }: { onProgress?: (p: ExtractProgress) => void } = {},
): Promise<ExtractedDocument> {
  const kind = detectKind(file);
  onProgress?.({ phase: "reading", done: 0, total: 1 });

  let raw: RawDocument;
  if (kind === "txt") {
    raw = await extractTxt(file);
  } else if (kind === "pdf") {
    // Dynamic import: pdfjs-dist only downloads once a user opens a PDF.
    const { extractPdf } = await import("./pdf");
    raw = await extractPdf(file, onProgress);
  } else {
    // EPUB (#9) is still a stub.
    throw new ExtractionError(
      ErrorCode.UNSUPPORTED_TYPE,
      "EPUB extraction not implemented yet (#9)",
    );
  }

  onProgress?.({ phase: "cleaning", done: 1, total: 1 });
  const doc = clean(raw);

  if (!doc.chapters.length) {
    throw new ExtractionError(ErrorCode.EMPTY_DOCUMENT, file.name);
  }
  return doc;
}
