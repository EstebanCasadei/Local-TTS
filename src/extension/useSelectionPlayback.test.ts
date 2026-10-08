import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectionItem } from "./queue";
import type { SynthesizeCallbacks, SynthesizeResult } from "../lib/ttsClient";
import type { PlaybackSnapshot } from "../lib/playbackQueue";

const mocks = vi.hoisted(() => ({
  requests: [] as { callbacks: SynthesizeCallbacks; resolve: (result: SynthesizeResult) => void }[],
  queues: [] as {
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    seekToChunk: ReturnType<typeof vi.fn>;
    emit: (snapshot: PlaybackSnapshot) => void;
  }[],
  decode: vi.fn(),
  restart: vi.fn(),
}));
vi.mock("../lib/ttsClient", () => ({
  VOICES: [
    { id: "voice-a", label: "A" },
    { id: "voice-b", label: "B" },
  ],
  TtsClient: class {
    cancel = vi.fn();
    restartWorker = mocks.restart;
    synthesize(_voice: string, _chunks: string[], callbacks: SynthesizeCallbacks) {
      return new Promise<SynthesizeResult>((resolve) =>
        mocks.requests.push({ callbacks, resolve }),
      );
    }
  },
}));
vi.mock("../lib/audio", () => ({
  decodeWav: mocks.decode,
  closeDecodeContext: vi.fn(),
  formatDuration: (value: number) => String(value),
}));
vi.mock("../lib/playbackQueue", () => ({
  PlaybackQueue: class {
    play = vi.fn(async () => {});
    pause = vi.fn(async () => {});
    dispose = vi.fn(async () => {});
    seekToChunk = vi.fn(async () => 0);
    setPlan = vi.fn();
    setRate = vi.fn(async () => {});
    setVolume = vi.fn();
    push = vi.fn();
    close = vi.fn();
    seek = vi.fn();
    emit: (snapshot: PlaybackSnapshot) => void;
    constructor(options: { onChange: (snapshot: PlaybackSnapshot) => void }) {
      this.emit = options.onChange;
      mocks.queues.push(this);
    }
  },
}));
import { useSelectionPlayback } from "./useSelectionPlayback";

const item = (id: string): SelectionItem => ({
  id,
  text: "Primero. Segundo.",
  title: "Page",
  url: "https://example.com",
  tabId: 1,
  frameId: 0,
  highlightAvailable: true,
});
beforeEach(() => {
  mocks.requests.length = 0;
  mocks.queues.length = 0;
  localStorage.clear();
  mocks.decode.mockReset().mockResolvedValue({ duration: 3 });
  mocks.restart.mockClear();
});
afterEach(() => vi.clearAllMocks());
async function chunk(request: number, index: number) {
  await act(async () => {
    mocks.requests[request].callbacks.onChunk?.({
      wav: new ArrayBuffer(4),
      index,
      total: 2,
      cached: false,
    });
  });
}

describe("selection playback", () => {
  it("honors pause requested before the first chunk is ready", async () => {
    const { result } = renderHook(useSelectionPlayback);
    act(() => result.current.start(item("a")));
    act(() => result.current.pause());
    await chunk(0, 0);
    expect(mocks.queues[0].play).not.toHaveBeenCalled();
    expect(mocks.queues[0].pause).toHaveBeenCalled();
    expect(result.current.status).toBe("paused");
  });
  it("ignores late decode results after clearing playback", async () => {
    let finish!: (buffer: unknown) => void;
    mocks.decode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(useSelectionPlayback);
    act(() => result.current.start(item("a")));
    act(() => {
      mocks.requests[0].callbacks.onChunk?.({
        wav: new ArrayBuffer(4),
        index: 0,
        total: 2,
        cached: false,
      });
    });
    act(() => result.current.stop());
    await act(async () => finish({ duration: 3 }));
    expect(mocks.queues).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });
  it("resumes the original chunk and local offset after navigating the queue", async () => {
    const { result } = renderHook(useSelectionPlayback);
    act(() => result.current.start(item("a")));
    await chunk(0, 0);
    act(() =>
      mocks.queues[0].emit({
        state: "playing",
        position: 5,
        duration: 8,
        index: 1,
        total: 2,
        playing: true,
        chunkStartTimes: [0, 3],
      }),
    );
    act(() => result.current.start(item("b")));
    act(() => result.current.start(item("a")));
    await chunk(2, 0);
    await chunk(2, 1);
    expect(mocks.queues[1].seekToChunk).toHaveBeenCalledWith(1, 2);
    expect(result.current.itemId).toBe("a");
  });
  it("preserves the reading point while freeing the previous voice worker", async () => {
    const { result } = renderHook(useSelectionPlayback);
    act(() => result.current.start(item("a")));
    await chunk(0, 0);
    act(() =>
      mocks.queues[0].emit({
        state: "playing",
        position: 2,
        duration: 8,
        index: 0,
        total: 2,
        playing: true,
        chunkStartTimes: [0],
      }),
    );
    act(() => result.current.changeVoice("voice-b"));
    expect(mocks.restart).toHaveBeenCalledTimes(1);
    await chunk(1, 0);
    expect(mocks.queues[1].seekToChunk).toHaveBeenCalledWith(0, 2);
    expect(result.current.voiceId).toBe("voice-b");
  });
  it("stops on a failed chunk and rejects stale callbacks", async () => {
    const { result } = renderHook(useSelectionPlayback);
    act(() => result.current.start(item("a")));
    await chunk(0, 0);
    act(() =>
      mocks.requests[0].callbacks.onChunkFailed?.({ index: 1, total: 2, message: "Failure" }),
    );
    expect(result.current.status).toBe("error");
    expect(mocks.queues[0].dispose).toHaveBeenCalled();
    await chunk(0, 1);
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
  it("releases the worker and queue on unmount", async () => {
    const { result, unmount } = renderHook(useSelectionPlayback);
    act(() => result.current.start(item("a")));
    await chunk(0, 0);
    unmount();
    expect(mocks.restart).toHaveBeenCalled();
    expect(mocks.queues[0].dispose).toHaveBeenCalled();
  });
});
