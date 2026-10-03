import { ESTIMATED_CHARS_PER_SEC, GAP_MS } from "./audio";

export const MP3_BITRATE = 64;
export const MAX_EXPORT_BYTES = 256 * 1024 * 1024;
export interface ExportBook {
  bookId: string;
  voiceId: string;
  chunks: string[];
  chunkIds: string[];
}
export interface ExportEstimate {
  seconds: number;
  bytes: number;
  cached: number;
  total: number;
  exactDuration: boolean;
  freeBytes: number;
  voiceBytes: number;
}
export interface ExportProgress {
  phase: "loading" | "encoding" | "finalizing";
  completed: number;
  total: number;
  bytes: number;
  seconds: number;
  remainingSeconds: number | null;
  downloadPercent?: number;
}

/** Parse RIFF chunks instead of assuming every WAV has a 44-byte header. */
export function wavMetadata(wav: ArrayBuffer): {
  sampleRate: number;
  dataOffset: number;
  sampleCount: number;
} {
  const view = new DataView(wav);
  if (
    wav.byteLength < 12 ||
    view.getUint32(0, true) !== 0x46464952 ||
    view.getUint32(8, true) !== 0x45564157
  )
    throw new Error("Invalid WAV container");
  let sampleRate = 0;
  let dataOffset = -1;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const tag = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > view.byteLength) throw new Error("Truncated WAV chunk");
    if (tag === 0x20746d66) {
      if (
        size < 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 2, true) !== 1 ||
        view.getUint16(start + 14, true) !== 16
      )
        throw new Error("Expected mono 16-bit PCM WAV");
      sampleRate = view.getUint32(start + 4, true);
    } else if (tag === 0x61746164) {
      dataOffset = start;
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }
  if (
    ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate) ||
    dataOffset < 0 ||
    dataSize === 0 ||
    dataSize % 2
  )
    throw new Error("Unsupported or empty WAV audio");
  return { sampleRate, dataOffset, sampleCount: dataSize / 2 };
}

export function pcmWav(wav: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const { sampleRate, dataOffset, sampleCount } = wavMetadata(wav);
  const view = new DataView(wav);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < samples.length; i++)
    samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  return { samples, sampleRate };
}

export function estimateExport(
  chunks: string[],
  cachedSeconds: number,
  cachedChars: number,
  cached: number,
  freeBytes: number,
): ExportEstimate {
  const chars = chunks.reduce((sum, text) => sum + text.trim().length, 0);
  const secondsPerChar =
    cachedChars > 0 ? cachedSeconds / cachedChars : 1 / ESTIMATED_CHARS_PER_SEC;
  const seconds =
    cachedSeconds +
    Math.max(0, chars - cachedChars) * secondsPerChar +
    (Math.max(0, chunks.length - 1) * GAP_MS) / 1000;
  return {
    seconds,
    bytes: Math.ceil((seconds * MP3_BITRATE * 1000) / 8 + 4096),
    cached,
    total: chunks.length,
    exactDuration: cached === chunks.length,
    freeBytes,
    voiceBytes: 0,
  };
}

export function requiredExportSpace(estimate: ExportEstimate): number {
  return Math.ceil(estimate.bytes * 1.2 + (estimate.voiceBytes ?? 0) + 8 * 1024 * 1024);
}

export function exportFilename(title: string): string {
  const safe = title
    .replace(/[<>:"/\\|?*]|\p{Cc}|\p{Cf}/gu, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 100)
    .trim();
  return `${safe || "Audiolibro"}.mp3`;
}

export interface ExportEncoder {
  configure(options: { channels: number; sampleRate: number; bitrate: number }): void;
  encode(samples: Float32Array[]): Uint8Array;
  finalize(): Uint8Array;
}

/** One encoder session for the entire book; never concatenate finalized MP3s. */
export async function encodeBook(
  total: number,
  read: (index: number) => Promise<ArrayBuffer>,
  encoder: ExportEncoder,
  write: (bytes: Uint8Array) => void,
  onChunk: (completed: number, seconds: number) => void,
): Promise<void> {
  let sampleRate = 0;
  let seconds = 0;
  for (let index = 0; index < total; index++) {
    const pcm = pcmWav(await read(index));
    if (!sampleRate) {
      sampleRate = pcm.sampleRate;
      encoder.configure({ channels: 1, sampleRate, bitrate: MP3_BITRATE });
    } else if (pcm.sampleRate !== sampleRate)
      throw new Error("Inconsistent sample rate between chunks");
    for (let start = 0; start < pcm.samples.length; start += 8192) {
      write(encoder.encode([pcm.samples.subarray(start, start + 8192)]));
    }
    seconds += pcm.samples.length / sampleRate;
    if (index < total - 1) {
      const gap = new Float32Array(Math.round((sampleRate * GAP_MS) / 1000));
      write(encoder.encode([gap]));
      seconds += gap.length / sampleRate;
    }
    onChunk(index + 1, seconds);
    // Allow progress, cancellation and the browser to run between chunks.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (total === 0) throw new Error("No chunks to export");
  write(encoder.finalize());
}
