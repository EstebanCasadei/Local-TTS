// Extraction router: dispatches by file extension (and mimetype as fallback).
// All extractors return the same shape (RawDocument) and the result always
// passes through clean(), so the rest of the app never branches by format.
//
// Ported from the PoC (src/lib/extract/index.js). PDF and EPUB are lazy-loaded
// — their heavy deps (pdfjs, jszip) only download if the user opens that file
// type. For now they throw "not implemented" (#8/#9).

import { clean } from "../textCleanup";
import { ErrorCode, ExtractionError, type ExtractedDocument, type RawDocument } from "./types";
import { extractTxt } from "./txt";

export { ErrorCode, ExtractionError, ERROR_MESSAGES } from "./types";
export { clean, fullText } from "../textCleanup";
export type {
  Chapter,
  ChapterSource,
  ExtractedDocument,
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

export interface ExtractProgress {
  phase: "reading" | "pages" | "chapters" | "cleaning";
  done: number;
  total: number;
}

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
  } else {
    // PDF (#8) and EPUB (#9) are lazy-loaded in the PoC; for now they're stubs.
    throw new ExtractionError(
      ErrorCode.UNSUPPORTED_TYPE,
      `${kind.toUpperCase()} extraction not implemented yet (#${kind === "pdf" ? "8" : "9"})`,
    );
  }

  onProgress?.({ phase: "cleaning", done: 1, total: 1 });
  const doc = clean(raw);

  if (!doc.chapters.length) {
    throw new ExtractionError(ErrorCode.EMPTY_DOCUMENT, file.name);
  }
  return doc;
}
