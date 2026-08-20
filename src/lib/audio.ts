// Audio utilities for TTS playback: decode WAV chunks and manage the
// AudioContext at the correct sample rate.
//
// Ported from the PoC (src/lib/audio.js) but trimmed to what the tracer bullet
// needs: decode + play. WAV encoding and buffer concatenation (for export) are
// deferred to when they're needed.
//
// Key insight from the PoC: Piper outputs WAVs at 16000 or 22050 Hz depending
// on the voice. Creating the AudioContext at that native sample rate avoids
// resampling artifacts during decodeAudioData. The context is shared across
// synthesis rounds and only recreated when the sample rate changes (e.g.
// switching from a 16 kHz voice to a 22.05 kHz one).

export const GAP_MS = 30;

/** Rough Piper Spanish speech synthesis rate, in characters per second. */
export const ESTIMATED_CHARS_PER_SEC = 15;

/**
 * Reads the sample rate from a WAV header (offset 24, little-endian).
 * Returns null if the buffer is too small or not a valid RIFF/WAV.
 */
export function readWavSampleRate(buffer: ArrayBuffer | null | undefined): number | null {
  if (!buffer || buffer.byteLength < 44) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46464952) return null; // "RIFF"
  const sampleRate = view.getUint32(24, true);
  return sampleRate >= 3000 && sampleRate <= 384000 ? sampleRate : null;
}

/**
 * Creates an AudioContext at the native sample rate of the WAVs so
 * decodeAudioData doesn't resample. Falls back to the browser default if the
 * requested rate is rejected.
 */
function createDecodeContext(sampleRate: number | null): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (sampleRate) {
    try {
      return new Ctor({ sampleRate });
    } catch {
      // Some browsers reject arbitrary sample rates — fall back to default.
    }
  }
  return new Ctor();
}

let sharedContext: AudioContext | null = null;

/**
 * Returns an AudioContext at the requested sample rate, reusing it across
 * synthesis rounds and recreating only when the rate changes (e.g. switching
 * from a 16 kHz voice to a 22.05 kHz voice).
 */
export function getAudioContext(sampleRate: number | null = null): AudioContext {
  if (sharedContext && (!sampleRate || sharedContext.sampleRate === sampleRate)) {
    return sharedContext;
  }
  sharedContext?.close().catch(() => {});
  sharedContext = createDecodeContext(sampleRate);
  return sharedContext;
}

/**
 * Decodes a WAV ArrayBuffer into an AudioBuffer using the shared AudioContext.
 * The context is created at the WAV's native sample rate to avoid resampling.
 */
export async function decodeWav(wav: ArrayBuffer): Promise<AudioBuffer> {
  const sampleRate = readWavSampleRate(wav);
  const ctx = getAudioContext(sampleRate);
  return ctx.decodeAudioData(wav);
}

/**
 * Formats seconds as H:MM:SS when there are hours, otherwise MM:SS.
 */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mStr = String(m).padStart(2, "0");
  const sStr = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mStr}:${sStr}`;
  return `${mStr}:${sStr}`;
}
