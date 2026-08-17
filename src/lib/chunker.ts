// Text segmentation for TTS — splits text into chunks safe for Piper synthesis.
//
// Piper/VITS synthesizes all input in a single forward pass: cost and memory
// grow with the number of phoneme IDs, so a long text causes a freeze (or an
// empty result when the WASM runs out of memory). The strategy is to cut by
// sentences and regroup into bounded chunks, never splitting a sentence unless
// it alone exceeds the limit.
//
// Ported from the PoC (src/lib/chunker.js) with full clause-splitting logic
// and proper TypeScript types. The "clausulas" granularity is the default for
// TTS: each clause becomes a chunk, so the gap between chunks acts as a
// micro-pause — more natural than grouping multiple clauses into one chunk.

export const MAX_CHUNK_CHARS = 220;

export type Granularity = "oraciones" | "clausulas";

export interface ChunkOptions {
  maxChars?: number;
  locale?: string;
  granularity?: Granularity;
}

/**
 * Splits text into sentences using Intl.Segmenter, with a punctuation-based
 * fallback for runtimes that don't support it.
 */
export function splitSentences(text: string, locale = "es"): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
    return Array.from(segmenter.segment(text), (s) => s.segment.trim()).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Splits a sentence into clauses separated by pause punctuation: commas,
 * semicolons, colons, em-dashes, and ellipses. If a single clause still
 * exceeds maxChars, it's split by words as a last resort.
 */
export function splitClauses(sentence: string, maxChars: number): string[] {
  const pieces = sentence.split(/(?<=[,;:—–…])\s+/);
  const out: string[] = [];

  for (const piece of pieces) {
    if (piece.length <= maxChars) {
      out.push(piece);
      continue;
    }

    // Clause too long — split by words.
    let current = "";
    for (const word of piece.split(/\s+/)) {
      if (current && current.length + 1 + word.length > maxChars) {
        out.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) out.push(current);
  }

  return out;
}

/**
 * Segments text into sentences and groups them into chunks of at most maxChars
 * characters, never splitting a sentence (unless it alone exceeds the limit).
 *
 * - granularity "clausulas" (default): each clause is a chunk → micro-pauses
 *   between chunks. Best for TTS.
 * - granularity "oraciones": sentences are grouped up to maxChars → fewer,
 *   longer chunks. Faster synthesis, less natural pacing.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxChars = MAX_CHUNK_CHARS, locale = "es", granularity = "clausulas" } = options;
  const normalized = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (granularity === "clausulas") {
      for (const sentence of splitSentences(paragraph, locale)) {
        for (const clause of splitClauses(sentence, maxChars)) {
          chunks.push(clause);
        }
      }
      continue;
    }

    // "oraciones" granularity: group sentences up to maxChars.
    let current = "";
    const flush = () => {
      if (current) chunks.push(current);
      current = "";
    };

    for (const sentence of splitSentences(paragraph, locale)) {
      const units = sentence.length > maxChars ? splitClauses(sentence, maxChars) : [sentence];

      for (const unit of units) {
        if (!current) {
          current = unit;
        } else if (current.length + 1 + unit.length <= maxChars) {
          current = `${current} ${unit}`;
        } else {
          flush();
          current = unit;
        }
      }
    }

    flush();
  }

  return chunks;
}
