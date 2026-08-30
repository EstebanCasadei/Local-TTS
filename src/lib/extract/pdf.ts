// PDF extractor (#8). Ported/expanded from the PoC (src/lib/extract/pdf.js).
//
// pdfjs-dist is only imported from here, and this module itself is only
// reached via a dynamic import from extract/index.ts — so the ~2MB library
// never lands in the main bundle, only downloading once a user opens a PDF.
//
// We use pdfjs's LEGACY build, not the modern one. The modern build
// (pdfjs-dist/build/pdf.mjs) assumes very new browsers and uses 2025-era JS
// APIs unconditionally — ReadableStream async iterators (for await...of) and
// Map/WeakMap.prototype.getOrInsertComputed() — that stable iOS Safari lacks,
// causing "TypeError: undefined is not a function" crashes on PDF upload
// (GlitchTip LOCALTTS-1/2/3, upstream mozilla/pdf.js#21557 & #20973). The
// legacy build polyfills these via core-js, so it works on Safari. Cost: the
// bundle is ~180KB larger pre-gzip (~50KB gzipped). See pdfjs's FAQ on legacy:
// https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#faq-support

import {
  ErrorCode,
  ExtractionError,
  type ExtractProgress,
  type RawChapter,
  type RawDocument,
  type TextBlock,
} from "./types";
import { buildPageLines, type PdfTextItem } from "./pdfLayout";
// `?url` gives us the worker's emitted asset URL without bundling its code here.
// Legacy worker matches the legacy main build.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type OutlineNode = Awaited<ReturnType<PdfDocument["getOutline"]>>[number];

/**
 * Extracts text from a PDF, page by page, reporting progress via onProgress.
 * Chapters are split using the PDF's own outline (bookmarks/TOC) — the same
 * boundaries a reader sees in their PDF viewer's sidebar — falling back to a
 * single chapter when the PDF doesn't have one.
 */
export async function extractPdf(
  file: File,
  onProgress?: (p: ExtractProgress) => void,
): Promise<RawDocument> {
  // Legacy build: polyfills the 2025-era JS APIs the modern build requires.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();

  let pdf: PdfDocument;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    throw new ExtractionError(ErrorCode.CORRUPT_FILE, file.name, err);
  }

  const blocks: TextBlock[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.({ phase: "pages", done: pageNumber - 1, total: pdf.numPages });

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((entry) => "str" in entry) as PdfTextItem[];

      const text = buildPageLines(items, viewport.width)
        .map((line) => line.text)
        .join("\n");
      blocks.push({ text, page: pageNumber });
    }
  } catch (err) {
    throw new ExtractionError(ErrorCode.PARSE_ERROR, file.name, err);
  }
  onProgress?.({ phase: "pages", done: pdf.numPages, total: pdf.numPages });

  const chapters = await buildChaptersFromOutline(pdf, blocks);
  onProgress?.({ phase: "chapters", done: 1, total: 1 });

  // getMetadata() is a non-async method that can throw synchronously on
  // browsers missing Map/WeakMap.getOrInsertComputed (legacy build polyfills
  // it, but wrap defensively so a metadata failure never blocks extraction).
  let metadata: Awaited<ReturnType<PdfDocument["getMetadata"]>> | null;
  try {
    metadata = await pdf.getMetadata();
  } catch {
    metadata = null;
  }
  const info = (metadata?.info ?? {}) as { Title?: string; Author?: string };

  return {
    kind: "pdf",
    fileName: file.name,
    bytes: file.size,
    meta: {
      ...(info.Title ? { title: info.Title } : {}),
      ...(info.Author ? { author: info.Author } : {}),
    },
    warnings: [],
    chapters,
  };
}

/**
 * Groups page blocks into chapters using the PDF's outline (bookmarks). Only
 * top-level entries are used — nested sub-sections stay inside their parent
 * chapter's text, same as the reference implementation. Falls back to a
 * single chapter when there's no outline or none of it resolves to a page.
 */
async function buildChaptersFromOutline(
  pdf: PdfDocument,
  blocks: TextBlock[],
): Promise<RawChapter[]> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline?.length) return [{ title: null, blocks }];

  const marks: { title: string; page: number }[] = [];
  for (const item of outline) {
    const page = await resolveOutlinePage(pdf, item);
    if (page != null) marks.push({ title: item.title.trim(), page });
  }
  if (marks.length === 0) return [{ title: null, blocks }];

  marks.sort((a, b) => a.page - b.page);

  const chapters: RawChapter[] = [];
  // If the first chapter doesn't start on page 1, whatever comes before it
  // (cover, foreword, table of contents) is kept as its own chapter instead
  // of silently dropped.
  if (marks[0].page > 1) {
    chapters.push({ title: null, blocks: blocks.filter((b) => (b.page ?? 0) < marks[0].page) });
  }

  marks.forEach((mark, i) => {
    const nextPage = marks[i + 1]?.page ?? Number.POSITIVE_INFINITY;
    chapters.push({
      title: mark.title || null,
      blocks: blocks.filter((b) => (b.page ?? 0) >= mark.page && (b.page ?? 0) < nextPage),
    });
  });

  return chapters;
}

/** Resolves an outline entry's destination to a 1-based page number. */
async function resolveOutlinePage(pdf: PdfDocument, item: OutlineNode): Promise<number | null> {
  try {
    const resolved =
      typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
    if (!Array.isArray(resolved) || resolved.length === 0) return null;
    const index = await pdf.getPageIndex(resolved[0]);
    return index + 1;
  } catch {
    return null;
  }
}
