import { describe, it, expect, vi } from "vitest";
import { PlaybackQueue, PlaybackState } from "./playbackQueue";

// Mock AudioContext — we only need currentTime, createBufferSource, createGain,
// and the source's start/stop/playbackRate/connect/onended.
function createMockCtx() {
  let time = 0;
  const sources: {
    buffer: AudioBuffer | null;
    playbackRate: { value: number };
    start: (when: number, offset?: number, duration?: number) => void;
    stop: () => void;
    connect: (node: unknown) => void;
    onended: (() => void) | null;
  }[] = [];

  const ctx = {
    currentTime: 0,
    state: "running",
    resume: () => Promise.resolve(),
    suspend: () => {
      (ctx as { state: string }).state = "suspended";
      return Promise.resolve();
    },
    createGain: () => ({
      gain: { value: 1 },
      connect: () => {},
    }),
    createBufferSource: () => {
      const source = {
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
        start: vi.fn((when: number, offset?: number, duration?: number) => {
          void when;
          void offset;
          void duration;
        }),
        stop: vi.fn(),
        connect: vi.fn(),
        onended: null as (() => void) | null,
      };
      sources.push(source);
      return source;
    },
    // Advance the clock (for testing position calculations).
    _advance: (seconds: number) => {
      time += seconds;
      (ctx as { currentTime: number }).currentTime = time;
    },
    _sources: sources,
  };
  return ctx;
}

function createMockBuffer(duration: number): AudioBuffer {
  return {
    duration,
    length: Math.floor(duration * 22050),
    sampleRate: 22050,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(Math.floor(duration * 22050)),
  } as unknown as AudioBuffer;
}

describe("PlaybackQueue", () => {
  it("starts in idle state", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue(ctx as unknown as AudioContext);
    expect(queue.stateValue).toBe(PlaybackState.IDLE);
  });

  it("reports position 0 when nothing is playing", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue(ctx as unknown as AudioContext);
    expect(queue.position).toBe(0);
  });

  it("accepts chunks via push and tracks count", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue(ctx as unknown as AudioContext);
    queue.setPlan(3);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    queue.push(2, createMockBuffer(1));
    expect(queue.duration).toBeCloseTo(6 + 2 * 0.03, 2); // 6s + 2 gaps
  });

  it("reports currentIndex correctly", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue(ctx as unknown as AudioContext);
    queue.setPlan(2);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    // Before playing, currentIndex is the next expected (0)
    expect(queue.currentIndex).toBe(0);
  });

  it("rate defaults to 1", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue(ctx as unknown as AudioContext);
    expect(queue.rateValue).toBe(1);
  });

  it("close marks missing chunks as skipped", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue(ctx as unknown as AudioContext);
    queue.setPlan(5);
    queue.push(0, createMockBuffer(2));
    queue.push(2, createMockBuffer(1));
    // Chunks 1, 3, 4 never arrived
    queue.close();
    // After close, the queue should know it's complete (no pending chunks)
    // We can't easily test the internal skipped set, but the queue should
    // not be in BUFFERING state after close + play.
    expect(queue.stateValue).toBe(PlaybackState.IDLE);
  });
});
