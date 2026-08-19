// PDF extractor (#8). Ported/expanded from the PoC (src/lib/extract/pdf.js).
//
// pdfjs-dist is only imported from here, and this module itself is only
// reached via a dynamic import from extract/index.ts — so the ~2MB library
// never lands in the main bundle, only downloading once a user opens a PDF.

import { ErrorCode, ExtractionError, type ExtractProgress, type RawDocument } from "./types";
import {
  buildPageLines,
  groupPagesIntoChapters,
  type PageLines,
  type PdfTextItem,
} from "./pdfLayout";
// `?url` gives us the worker's emitted asset URL without bundling its code here.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Extracts text from a PDF, page by page, grouping the result into chapters
 * by heading heuristics (falling back to one chapter per page). Reports
 * page-by-page progress via onProgress.
 */
export async function extractPdf(
  file: File,
  onProgress?: (p: ExtractProgress) => void,
): Promise<RawDocument> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();

  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch {
    throw new ExtractionError(ErrorCode.CORRUPT_FILE, file.name);
  }

  const pages: PageLines[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.({ phase: "pages", done: pageNumber - 1, total: pdf.numPages });

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((entry) => "str" in entry) as PdfTextItem[];

      pages.push({ pageNumber, lines: buildPageLines(items, viewport.width) });
    }
  } catch {
    throw new ExtractionError(ErrorCode.PARSE_ERROR, file.name);
  }
  onProgress?.({ phase: "pages", done: pdf.numPages, total: pdf.numPages });

  const chapters = groupPagesIntoChapters(pages);
  onProgress?.({ phase: "chapters", done: 1, total: 1 });

  const metadata = await pdf.getMetadata().catch(() => null);
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
