// Text cleanup pipeline. Pure functions — no DOM, no file access — so they're
// fully testable in Node/jsdom.
//
// Ported from the PoC (src/lib/textCleanup.js). The order matters:
// 1. Detect headers/footers (needs lines as they came, with page numbers)
// 2. Join hyphenated line breaks
// 3. Collapse whitespace (convert stray newlines to spaces where appropriate)
//
// The goal: produce clean, continuous text that a TTS engine can read without
// awkward pauses at line breaks or page numbers.

import type {
  Chapter,
  ChapterSource,
  ExtractedDocument,
  RawDocument,
  Warning,
} from "./extract/types";

/** Lines longer than this aren't considered header/footer. */
const HEADER_MAX_CHARS = 80;
/** Minimum distinct pages a line must repeat on to be considered header/footer. */
const HEADER_MIN_PAGES = 3;
/** Or this fraction of the document's pages. */
const HEADER_MIN_RATIO = 0.25;

/**
 * Normalizes a line for repetition comparison: no numbers (so "Página 12" and
 * "Página 13" count as the same), collapsed whitespace, lowercase.
 */
function headerKey(line: string): string {
  return line.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Detects headers/footers: short lines that appear identically (minus numbers)
 * on many distinct pages. Only meaningful for paginated docs (PDF); TXT/EPUB
 * blocks don't have page numbers so nothing is removed.
 */
export function findRepeatedLines(blocks: { text: string; page?: number }[]): Set<string> {
  const pagesByKey = new Map<string, Set<number>>();
  const pages = new Set<number>();

  for (const block of blocks) {
    if (block.page == null) continue;
    pages.add(block.page);

    // Only the first and last non-empty line of each page can be header/footer.
    const lines = block.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of [lines[0], lines[lines.length - 1]]) {
      if (!line || line.length > HEADER_MAX_CHARS) continue;
      const key = headerKey(line);
      if (!key) continue;
      if (!pagesByKey.has(key)) pagesByKey.set(key, new Set());
      pagesByKey.get(key)!.add(block.page);
    }
  }

  const threshold = Math.max(HEADER_MIN_PAGES, Math.ceil(pages.size * HEADER_MIN_RATIO));
  const repeated = new Set<string>();
  for (const [key, keyPages] of pagesByKey) {
    if (keyPages.size >= threshold) repeated.add(key);
  }
  return repeated;
}

/** Removes lines whose normalized key is in the repeated set (first/last line only). */
function stripRepeatedLines(text: string, repeated: Set<string>): string {
  if (repeated.size === 0) return text;
  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.trim());
  const last = lines.reduce((acc, l, i) => (l.trim() ? i : acc), -1);
  if (first === -1) return text;

  return lines
    .filter((line, i) => {
      if (i !== first && i !== last) return true;
      const trimmed = line.trim();
      if (trimmed.length > HEADER_MAX_CHARS) return true;
      return !repeated.has(headerKey(trimmed));
    })
    .join("\n");
}

// A standalone page number on its own line (typical in PDFs).
const PAGE_NUMBER_LINE = /^\s*[-–—]?\s*(?:p[áa]g(?:ina)?\.?\s*)?\d{1,4}\s*[-–—]?\s*$/i;

/**
 * Joins words broken by hyphen at end of line: "compu-\ntadora" → "computadora".
 * Respects hyphens when the second half starts with uppercase (proper compound)
 * and em-dashes (dialogue).
 */
export function joinHyphenated(text: string): string {
  return text.replace(
    /(\p{Ll}\p{L}*)-[ \t]*\r?\n[ \t]*(\p{Ll}\p{L}*)/gu,
    (_match, head: string, tail: string) => `${head}${tail}`,
  );
}

const FIN_DE_ORACION = new Set(".!?…");

/** Strips closing quotes/brackets to find the real sentence-ending sign. */
function cierre(s: string): string {
  return s
    .replace(/[»"'')\]]+$/, "")
    .trimEnd()
    .slice(-1);
}

/** Checks if the character after offset starts with uppercase (new paragraph). */
function empiezaConMayuscula(string: string, offset: number): boolean {
  const next = string
    .slice(offset + 1)
    .trimStart()
    .slice(0, 1);
  return /^\p{Lu}$/u.test(next);
}

/**
 * Collapses whitespace and line breaks: a newline is preserved if the previous
 * line ended with a sentence-ending sign OR the next line starts with uppercase
 * (new paragraph). Otherwise the newline becomes a space. This prevents PDFs
 * that insert line breaks mid-sentence from causing TTS to pause and stutter.
 */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "") // soft hyphen that some PDFs insert
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/(?<=\S)\n(?=\S)/g, (_match, offset: number, string: string) => {
      const prev = FIN_DE_ORACION.has(cierre(string.slice(0, offset)));
      const nextMayus = empiezaConMayuscula(string, offset);
      return prev || nextMayus ? "\n" : " ";
    })
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

/** Cleans a single block's text: remove page numbers, join hyphens, collapse whitespace. */
export function cleanBlockText(text: string): string {
  const withoutPageNumbers = text
    .split("\n")
    .filter((line) => !PAGE_NUMBER_LINE.test(line))
    .join("\n");
  return collapseWhitespace(joinHyphenated(withoutPageNumbers));
}

/** Converts a RawDocument into a clean ExtractedDocument ready for TTS. */
export function clean(raw: RawDocument): ExtractedDocument {
  const allBlocks = raw.chapters.flatMap((chapter) => chapter.blocks);
  const repeated = findRepeatedLines(allBlocks);
  const warnings: Warning[] = [...(raw.warnings ?? [])];

  if (repeated.size) {
    warnings.push({
      code: "REPEATED_LINES_REMOVED",
      message: `Se eliminaron ${repeated.size} línea(s) repetidas de encabezado/pie de página.`,
    });
  }

  const chapters: Chapter[] = [];
  raw.chapters.forEach((chapter, i) => {
    const text = chapter.blocks
      .map((block) => cleanBlockText(stripRepeatedLines(block.text, repeated)))
      .filter(Boolean)
      .join("\n");

    const pages = chapter.blocks.map((b) => b.page).filter((p): p is number => p != null);
    const hrefs = [...new Set(chapter.blocks.map((b) => b.href).filter((h): h is string => !!h))];

    const source: ChapterSource = {
      ...(pages.length
        ? { pages: [Math.min(...pages), Math.max(...pages)] as [number, number] }
        : {}),
      ...(hrefs.length ? { hrefs } : {}),
    };

    chapters.push({
      index: chapters.length,
      title: chapter.title?.trim() || `Capítulo ${i + 1}`,
      text,
      chars: text.length,
      source,
    });
  });

  // Drop empty chapters (covers, credits pages) but warn about them.
  const withText = chapters.filter((chapter) => chapter.text.length > 0);
  const dropped = chapters.length - withText.length;
  if (dropped > 0) {
    warnings.push({
      code: "EMPTY_CHAPTERS_DROPPED",
      message: `Se descartaron ${dropped} sección(es) sin texto.`,
    });
  }
  withText.forEach((chapter, index) => {
    chapter.index = index;
  });

  return {
    kind: raw.kind,
    fileName: raw.fileName,
    title: raw.meta?.title?.trim() || raw.fileName.replace(/\.[^.]+$/, ""),
    chapters: withText,
    meta: raw.meta ?? {},
    warnings,
  };
}

/** Full text of a document (derived, not stored — single source of truth). */
export function fullText(doc: ExtractedDocument): string {
  return doc.chapters.map((chapter) => chapter.text).join("\n");
}
