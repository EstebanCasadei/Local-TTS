// Text segmentation for TTS — splits text into chunks safe for Piper synthesis.
// Ported from the PoC (src/lib/chunker.js). Full implementation in issue #5.

export const MAX_CHUNK_CHARS = 220;

export function splitSentences(text: string, locale = 'es'): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), (s) => s.segment.trim()).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chunkText(
  text: string,
  { locale = 'es' }: { maxChars?: number; locale?: string } = {},
): string[] {
  const normalized = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!normalized) return [];

  return splitSentences(normalized, locale);
}
