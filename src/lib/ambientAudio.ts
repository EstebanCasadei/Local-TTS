// Ambient noise generation for the AudioPanel: white/pink/brown noise
// synthesized on the fly (no bundled/remote audio files needed), encoded as a
// looping WAV so it can play through the same <audio> element used for
// user-imported tracks (see useAmbientAudio).
//
// The loop is seamless: extra CROSSFADE_SECONDS of noise are generated past
// the loop point and blended back into the head (out[i] = tail[i]*(1-t) +
// head[i]*t), so playback wraps into a continuation of the same underlying
// noise sequence instead of jumping between two unrelated random samples.

export type NoiseColor = "white" | "pink" | "brown";

export const NOISE_TRACKS: { id: NoiseColor; name: string }[] = [
  { id: "white", name: "Ruido blanco" },
  { id: "pink", name: "Ruido rosa" },
  { id: "brown", name: "Ruido marrón" },
];

const SAMPLE_RATE = 44100;
const LOOP_SECONDS = 20;
const CROSSFADE_SECONDS = 2;

function generateRawNoise(color: NoiseColor, length: number): Float32Array {
  const samples = new Float32Array(length);

  if (color === "white") {
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    return samples;
  }

  if (color === "pink") {
    // Paul Kellet's refined pink noise filter.
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      samples[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return samples;
  }

  // brown
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    samples[i] = lastOut * 3.5;
  }
  return samples;
}

/** Generates a `LOOP_SECONDS`-long buffer that loops back to its own start seamlessly. */
function generateNoiseSamples(color: NoiseColor): Float32Array {
  const length = SAMPLE_RATE * LOOP_SECONDS;
  const fadeLength = SAMPLE_RATE * CROSSFADE_SECONDS;
  // Generate a bit more than one loop's worth so the extra tail can be
  // crossfaded into the head — it's a direct continuation of the same
  // sequence, so the blend has no audible discontinuity.
  const raw = generateRawNoise(color, length + fadeLength);
  const looped = raw.slice(0, length);
  for (let i = 0; i < fadeLength; i++) {
    const t = i / fadeLength;
    looped[i] = raw[length + i] * (1 - t) + raw[i] * t;
  }
  return looped;
}

/** Encodes mono Float32 samples ([-1, 1]) as a 16-bit PCM WAV Blob. */
function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Generated once per color and reused — regenerating on every play would
// re-render several seconds of noise and produce a new (equally valid, but
// wasteful) object URL each time.
const noiseUrlCache = new Map<NoiseColor, string>();

/** Object URL for a short looping WAV of the given noise color, memoized. */
export function noiseTrackUrl(color: NoiseColor): string {
  const cached = noiseUrlCache.get(color);
  if (cached) return cached;
  const url = URL.createObjectURL(encodeWav(generateNoiseSamples(color)));
  noiseUrlCache.set(color, url);
  return url;
}
