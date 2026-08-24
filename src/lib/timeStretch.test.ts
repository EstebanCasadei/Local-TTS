import { describe, it, expect } from "vitest";
import { timeStretchBuffer } from "./timeStretch";

const SAMPLE_RATE = 22050;

function makeBuffer(samples: Float32Array, numberOfChannels = 1): AudioBuffer {
  return {
    duration: samples.length / SAMPLE_RATE,
    length: samples.length,
    sampleRate: SAMPLE_RATE,
    numberOfChannels,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function makeMockCtx() {
  return {
    createBuffer: (numberOfChannels: number, length: number, sampleRate: number) => {
      const data: Float32Array[] = Array.from(
        { length: numberOfChannels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch: number) => data[ch],
        copyToChannel: (source: Float32Array, ch: number) => {
          data[ch].set(source.subarray(0, length));
        },
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
}

describe("timeStretchBuffer", () => {
  it("returns the same buffer when rate is 1 (no-op)", () => {
    const ctx = makeMockCtx();
    const buffer = makeBuffer(new Float32Array(4096).fill(0.5));
    expect(timeStretchBuffer(ctx, buffer, 1)).toBe(buffer);
  });

  it("shortens the buffer when speeding up (rate > 1)", () => {
    const ctx = makeMockCtx();
    const buffer = makeBuffer(new Float32Array(SAMPLE_RATE * 2).fill(0.5)); // 2s
    const stretched = timeStretchBuffer(ctx, buffer, 2);
    // Output duration should be roughly half the input's.
    expect(stretched.duration).toBeGreaterThan(0.8);
    expect(stretched.duration).toBeLessThan(1.2);
  });

  it("lengthens the buffer when slowing down (rate < 1)", () => {
    const ctx = makeMockCtx();
    const buffer = makeBuffer(new Float32Array(SAMPLE_RATE * 2).fill(0.5)); // 2s
    const stretched = timeStretchBuffer(ctx, buffer, 0.5);
    // Output duration should be roughly double the input's.
    expect(stretched.duration).toBeGreaterThan(3.5);
    expect(stretched.duration).toBeLessThan(4.5);
  });

  it("does not blow up on buffers shorter than one frame", () => {
    const ctx = makeMockCtx();
    const buffer = makeBuffer(new Float32Array(64).fill(0.1));
    expect(() => timeStretchBuffer(ctx, buffer, 1.5)).not.toThrow();
  });

  it("preserves signal amplitude roughly (no wild gain from overlap-add)", () => {
    const ctx = makeMockCtx();
    const constant = new Float32Array(SAMPLE_RATE).fill(0.4);
    const buffer = makeBuffer(constant);
    const stretched = timeStretchBuffer(ctx, buffer, 1.5);
    const data = stretched.getChannelData(0);
    // Sample somewhere in the middle, away from edge fade-in/out effects.
    const mid = data[Math.floor(data.length / 2)];
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.5);
  });
});
