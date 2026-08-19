// Pure layout helpers for PDF text extraction: reconstructing reading order
// from pdfjs text items (line grouping + basic multi-column detection).
// Chapter division uses the PDF's own outline (see pdf.ts) instead of a
// heuristic — far more reliable than guessing headings by font size.
//
// Kept free of pdfjs-dist itself (only a minimal item shape is needed) so it
// stays fast and easy to unit test without loading the real library.

/** Minimal shape of a pdfjs TextItem we rely on. */
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

/** A reconstructed line of text with its position. */
export interface Line {
  text: string;
  x: number;
  xEnd: number;
  y: number;
}

/** Max vertical offset (PDF user-space units) for items to be on the same line. */
const Y_TOLERANCE = 2;
/** Width of the "gutter" band around the page's midpoint, as a fraction of page width. */
const GUTTER_RATIO = 0.06;
/** Minimum items a half must have to be considered a real column. */
const MIN_COLUMN_ITEMS = 4;

interface NormalizedItem {
  text: string;
  x: number;
  xEnd: number;
  y: number;
}

function normalize(items: PdfTextItem[]): NormalizedItem[] {
  return items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      text: item.str,
      x: item.transform[4],
      xEnd: item.transform[4] + item.width,
      y: item.transform[5],
    }));
}

/** Groups normalized items (already restricted to a single column) into text lines. */
function groupIntoLines(items: NormalizedItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= Y_TOLERANCE) {
      const needsSpace = item.x - last.xEnd > 1 && !last.text.endsWith(" ");
      last.text += `${needsSpace ? " " : ""}${item.text}`;
      last.xEnd = Math.max(last.xEnd, item.xEnd);
    } else {
      lines.push({ ...item });
    }
  }
  return lines;
}

/**
 * Detects a basic two-column layout: a vertical "gutter" band near the page's
 * horizontal midpoint with a real amount of text on both sides and (almost)
 * nothing crossing it. Returns the gutter's x-center, or null for single-column
 * pages (the common case).
 */
export function detectColumnSplit(items: PdfTextItem[], pageWidth: number): number | null {
  const normalized = normalize(items);
  if (normalized.length === 0 || pageWidth <= 0) return null;

  const mid = pageWidth / 2;
  const half = (pageWidth * GUTTER_RATIO) / 2;
  const left = normalized.filter((item) => item.xEnd <= mid - half);
  const right = normalized.filter((item) => item.x >= mid + half);
  const spanning = normalized.filter((item) => item.x < mid - half && item.xEnd > mid + half);

  // Any item that spans the gutter (e.g. a full-width heading) means this
  // isn't a real two-column layout — bail out to keep the heuristic simple.
  const isTwoColumn =
    left.length >= MIN_COLUMN_ITEMS && right.length >= MIN_COLUMN_ITEMS && spanning.length === 0;

  return isTwoColumn ? mid : null;
}

/**
 * Reconstructs a page's lines in reading order. Splits basic two-column
 * layouts into left-column-then-right-column order; single-column pages are
 * read top to bottom as-is.
 */
export function buildPageLines(items: PdfTextItem[], pageWidth: number): Line[] {
  const normalized = normalize(items);
  const split = detectColumnSplit(items, pageWidth);
  if (split == null) return groupIntoLines(normalized);

  const left = normalized.filter((item) => (item.x + item.xEnd) / 2 < split);
  const right = normalized.filter((item) => (item.x + item.xEnd) / 2 >= split);
  return [...groupIntoLines(left), ...groupIntoLines(right)];
}
