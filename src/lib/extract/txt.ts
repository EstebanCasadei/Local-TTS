// TXT/MD extractor — the simplest format. A TXT is a single-chapter document.
// Ported from the PoC (src/lib/extract/txt.js).

import { ErrorCode, ExtractionError, type RawDocument } from "./types";

/**
 * Extracts text from a .txt or .md file. A TXT is a single chapter with one
 * block containing all the text.
 */
export async function extractTxt(file: File): Promise<RawDocument> {
  const text = await readAsText(file);

  if (!text.trim()) {
    throw new ExtractionError(ErrorCode.EMPTY_DOCUMENT, file.name);
  }

  return {
    kind: "txt",
    fileName: file.name,
    bytes: file.size,
    meta: {},
    warnings: [],
    chapters: [{ title: null, blocks: [{ text }] }],
  };
}

/** Reads a File as text using the FileReader API. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new ExtractionError(ErrorCode.CORRUPT_FILE, file.name));
    reader.readAsText(file);
  });
}
