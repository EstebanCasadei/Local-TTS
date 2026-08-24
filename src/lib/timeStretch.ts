// Time-stretching via Overlap-Add (OLA): changes an AudioBuffer's playback
// duration without changing its pitch. This is needed because
// AudioBufferSourceNode.playbackRate resamples the buffer, which speeds up
// (or slows down) the audio AND shifts its pitch — there's no separate
// "preservesPitch" on AudioBufferSourceNode like there is on HTMLMediaElement.
//
// The algorithm slices the signal into overlapping frames, then re-places
// them closer together (to speed up) or further apart (to slow down) using a
// Hann window for the overlap. With 50% overlap, Hann windows sum to a
// constant, so no extra gain normalization is needed.
//
// Chunks here are single TTS sentences (a few seconds), so this runs
// synchronously right before scheduling without noticeable delay.

const FRAME_SIZE = 1024;
const HOP_OUT = FRAME_SIZE / 2;

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

const WINDOW = hannWindow(FRAME_SIZE);

function stretchChannel(input: Float32Array, rate: number): Float32Array {
  if (input.length < FRAME_SIZE) return input.slice();

  const hopIn = HOP_OUT * rate;
  const frames = Math.max(1, Math.floor((input.length - FRAME_SIZE) / hopIn) + 1);
  const outLength = Math.round(HOP_OUT * (frames - 1) + FRAME_SIZE);
  const output = new Float32Array(outLength);

  let inPos = 0;
  let outPos = 0;
  for (let f = 0; f < frames; f++) {
    const start = Math.round(inPos);
    const limit = Math.min(FRAME_SIZE, input.length - start);
    for (let i = 0; i < limit; i++) {
      output[outPos + i] += input[start + i] * WINDOW[i];
    }
    inPos += hopIn;
    outPos += HOP_OUT;
  }
  return output;
}

/**
 * Returns a new AudioBuffer that plays `buffer`'s content stretched to
 * `1 / rate` of its original duration (matching what
 * `AudioBufferSourceNode.playbackRate = rate` would do timing-wise) while
 * keeping the original pitch. Schedule the result with playbackRate left
 * at 1. Returns `buffer` unchanged when rate is 1.
 */
export function timeStretchBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  rate: number,
): AudioBuffer {
  if (rate === 1) return buffer;

  let outLength = 0;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const stretched = stretchChannel(buffer.getChannelData(ch), rate);
    channels.push(stretched);
    outLength = Math.max(outLength, stretched.length);
  }

  const out = ctx.createBuffer(buffer.numberOfChannels, outLength, buffer.sampleRate);
  for (let ch = 0; ch < channels.length; ch++) {
    out.copyToChannel(channels[ch] as Float32Array<ArrayBuffer>, ch);
  }
  return out;
}
