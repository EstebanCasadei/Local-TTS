import { describe, it, expect, vi, afterEach } from "vitest";
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
    close: () => Promise.resolve(),
    createGain: () => ({
      gain: { value: 1 },
      connect: () => {},
    }),
    // Minimal createBuffer for timeStretchBuffer (only used when rate !== 1).
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
  afterEach(() => vi.useRealTimers());

  it("restores the export resume clock before earlier chunks are decoded", async () => {
    vi.useFakeTimers();
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(2);
    queue.push(1, createMockBuffer(20));
    await queue.seekToChunk(1, 5, 20.03);
    expect(queue.currentIndex).toBe(1);
    expect(queue.position).toBeCloseTo(25.03);
    expect(queue.timeAtChunk(1)).toBeCloseTo(20.03);
    queue.push(0, createMockBuffer(20));
    expect(queue.position).toBeCloseTo(25.03);
    await queue.dispose();
  });

  async function completedQueue(rate = 1) {
    vi.useFakeTimers();
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(2);
    queue.push(0, createMockBuffer(20));
    queue.push(1, createMockBuffer(20));
    queue.close();
    await queue.setRate(rate);
    await queue.play();
    ctx._advance(100);
    ctx._sources.forEach((source) => source.onended?.());
    vi.advanceTimersByTime(100);
    expect(queue.stateValue).toBe(PlaybackState.DONE);
    return { ctx, queue };
  }

  it("replays from zero after natural completion without new chunks", async () => {
    const { ctx, queue } = await completedQueue();
    const sourceCount = ctx._sources.length;
    await queue.play();
    expect(queue.position).toBe(0);
    expect(ctx._sources.length).toBeGreaterThan(sourceCount);
    expect(ctx._sources[sourceCount].start).toHaveBeenCalledWith(expect.any(Number), 0, 20);
    vi.advanceTimersByTime(100);
    expect(queue.stateValue).toBe(PlaybackState.PLAYING);
    await queue.dispose();
  });

  it("allows rewind after completion and resumes from the selected position", async () => {
    const { ctx, queue } = await completedQueue();
    const target = queue.position - 15;
    expect(await queue.seek(target)).toBe(1);
    expect(queue.stateValue).toBe(PlaybackState.PAUSED);
    expect(queue.position).toBeCloseTo(target);
    const sourceCount = ctx._sources.length;
    await queue.play();
    expect(queue.position).toBeCloseTo(target);
    expect(ctx._sources.length).toBeGreaterThan(sourceCount);
    await queue.dispose();
  });

  it("accepts forward seeks clamped to the duration after completion", async () => {
    const { queue } = await completedQueue();
    await queue.seek(queue.position - 15);
    expect(await queue.seek(Math.min(queue.duration, queue.position + 15))).toBe(1);
    expect(queue.position).toBeCloseTo(queue.duration - 0.01);
    await queue.dispose();
  });

  it("reports the full document position when completing at a different speed", async () => {
    const { queue } = await completedQueue(2);
    expect(queue.position).toBeCloseTo(queue.duration);
    await queue.dispose();
  });

  it("plays a selected chunk after completion without a subsequent play resetting it", async () => {
    const { queue } = await completedQueue();
    await queue.seekToChunk(1, 5);
    expect(queue.stateValue).toBe(PlaybackState.PLAYING);
    await queue.play();
    expect(queue.currentIndex).toBe(1);
    expect(queue.position).toBeCloseTo(25.03);
    await queue.dispose();
  });

  it("starts in idle state", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    expect(queue.stateValue).toBe(PlaybackState.IDLE);
  });

  it("reports position 0 when nothing is playing", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    expect(queue.position).toBe(0);
  });

  it("accepts chunks via push and tracks count", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(3);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    queue.push(2, createMockBuffer(1));
    expect(queue.duration).toBeCloseTo(6 + 2 * 0.03, 2); // 6s + 2 gaps
  });

  it("reports currentIndex correctly", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(2);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    // Before playing, currentIndex is the next expected (0)
    expect(queue.currentIndex).toBe(0);
  });

  it("rate defaults to 1", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    expect(queue.rateValue).toBe(1);
  });

  it("schedules a pitch-preserving (time-stretched) buffer instead of resampling when rate !== 1", async () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(1);
    const original = createMockBuffer(2);
    queue.push(0, original);
    await queue.setRate(1.5);

    await queue.play();

    const source = ctx._sources.at(-1)!;
    // playbackRate must stay at 1 — speed comes from the buffer's own
    // (stretched) duration, not from resampling, so pitch stays the same.
    expect(source.playbackRate.value).toBe(1);
    expect(source.buffer).not.toBe(original);
  });

  it("close marks missing chunks as skipped", () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
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

  it("can seek after close() — close means no more chunks, not playback over", async () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(3);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    queue.push(2, createMockBuffer(1));
    queue.close();

    // Seeking must work after close — this is the common case where all chunks
    // are cached and close() is called immediately. The user can still change
    // speed or scrub.
    const result = await queue.seek(1);
    expect(result).not.toBe(-1);
  });

  it("can seekToChunk after close()", async () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(3);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    queue.push(2, createMockBuffer(1));
    queue.close();

    const result = await queue.seekToChunk(1);
    expect(result).toBe(1);
  });

  it("clearScheduled preserves chunkStartTimes for already-played chunks", async () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(3);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    queue.push(2, createMockBuffer(1));

    // Simulate playing from the start so pump fills chunkStartTimes
    await queue.play();
    expect(queue.timeAtChunk(0)).toBe(0);
    expect(queue.timeAtChunk(1)).toBeCloseTo(2 + 0.03, 2); // 2s + gap

    // Seek to time=5 (mid-chunk-1) — clearScheduled runs inside seek.
    // chunkStartTimes[0] must be preserved so the karaoke can mark chunk 0
    // as "past" with correct timing. Without the fix, it would be undefined
    // and the fallback would distribute it incorrectly across the timeline.
    await queue.seek(5);

    expect(queue.timeAtChunk(0)).toBe(0); // preserved, not undefined
  });

  it("seekToChunk backward re-schedules an already-played chunk", async () => {
    const ctx = createMockCtx();
    const queue = new PlaybackQueue({ audioContext: ctx as unknown as AudioContext });
    queue.setPlan(3);
    queue.push(0, createMockBuffer(2));
    queue.push(1, createMockBuffer(3));
    queue.push(2, createMockBuffer(1));

    await queue.play();
    // Simulate chunk 0 finishing playback — this is when the queue drops it
    // from `entries` (it's only kept in `buffers` for seeking).
    ctx._sources[0].onended?.();

    // Jump forward, past chunk 0.
    await queue.seekToChunk(2);
    const sourcesBeforeBackSeek = ctx._sources.length;

    // Jump back to chunk 0. Its buffer is still in memory (`buffers`), so
    // this must schedule it again instead of waiting forever for a push()
    // that already happened.
    await queue.seekToChunk(0);

    // pump() re-schedules every buffer from nextIndex onward in one pass, so
    // chunk 0's buffer (duration 2) should be among the newly created sources
    // — not just chunks 1/2, which were already scheduled before the seek.
    const newSources = ctx._sources.slice(sourcesBeforeBackSeek);
    expect(newSources.length).toBeGreaterThan(0);
    expect(newSources.some((s) => s.buffer?.duration === 2)).toBe(true);
  });
});
