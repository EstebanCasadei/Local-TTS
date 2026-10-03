import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTts } from "./useTts";
import type { PlaybackSnapshot } from "../lib/playbackQueue";
import type { SynthesizeCallbacks } from "../lib/ttsClient";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  restart: vi.fn(),
  dispose: vi.fn(),
  seekToChunk: vi.fn(),
  synthesize: vi.fn(),
  callbacks: null as SynthesizeCallbacks | null,
  reject: null as ((error: Error) => void) | null,
}));
vi.mock("../lib/ttsClient", () => ({
  VOICES: [{ id: "voice", label: "Voice" }],
  TtsClient: class {
    cancel = mocks.cancel;
    restartWorker = mocks.restart;
    prioritize = vi.fn();
    synthesize(...args: unknown[]) {
      mocks.callbacks = args[2] as SynthesizeCallbacks;
      mocks.synthesize(...args);
      return new Promise((_, reject) => {
        mocks.reject = reject;
      });
    }
  },
}));
vi.mock("../lib/audio", async (original) => ({
  ...(await original<typeof import("../lib/audio")>()),
  decodeWav: vi.fn().mockResolvedValue({ duration: 20 }),
  closeDecodeContext: vi.fn(),
}));
vi.mock("../lib/playbackQueue", async (original) => {
  const module = await original<typeof import("../lib/playbackQueue")>();
  return {
    ...module,
    PlaybackQueue: class {
      position = 25;
      currentIndex = 1;
      timeAtChunk() {
        return 20;
      }
      private options: { onChange: (snapshot: PlaybackSnapshot) => void };
      constructor(options: { onChange: (snapshot: PlaybackSnapshot) => void }) {
        this.options = options;
      }
      setPlan() {}
      setRate() {}
      setVolume() {}
      push() {}
      close() {}
      notify(state: "playing" | "paused" | "idle") {
        this.options.onChange({
          state,
          position: this.position,
          duration: 40,
          index: 1,
          total: 2,
          playing: state === "playing",
          chunkStartTimes: [0, 20],
        });
      }
      play() {
        this.notify("playing");
      }
      seekToChunk(index: number, offset: number, start?: number) {
        mocks.seekToChunk(index, offset, start);
        this.notify("playing");
      }
      pause() {
        this.notify("paused");
        return Promise.resolve();
      }
      dispose() {
        mocks.dispose();
        this.position = 0;
        this.notify("idle");
        return Promise.resolve();
      }
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("reading suspension for MP3 export", () => {
  it("releases playback resources, ignores stale callbacks and resumes at the saved chunk offset", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { result } = renderHook(useTts);
    act(() => {
      void result.current.synthesize("First. Second.", "book", ["c0", "c1"], ["First.", "Second."]);
    });
    await act(async () => {
      mocks.callbacks!.onVoiceReady!();
      mocks.callbacks!.onChunk!({ index: 0, total: 2, wav: new ArrayBuffer(44), cached: true });
    });
    expect(result.current.isPlaying).toBe(true);
    const stale = mocks.callbacks!;
    const reject = mocks.reject!;
    await act(async () => {
      await result.current.pauseForExport();
      reject(new Error("TTS worker restarted"));
    });
    expect(mocks.cancel).toHaveBeenCalled();
    expect(mocks.restart).toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalled();
    expect(result.current.status).toBe("paused");
    expect(result.current.currentPosition).toBe(25);
    act(() => stale.onVoiceProgress!({ loaded: 1, total: 10 }));
    expect(result.current.status).toBe("paused");
    act(() => result.current.play());
    expect(mocks.synthesize.mock.calls.at(-1)?.slice(3)).toEqual(["book", ["c0", "c1"]]);
    expect(result.current.status).toBe("downloading-voice");
    await act(async () => {
      mocks.callbacks!.onChunk!({ index: 1, total: 2, wav: new ArrayBuffer(44), cached: true });
    });
    expect(mocks.seekToChunk).toHaveBeenCalledWith(1, 5, 20);
    expect(result.current.isPlaying).toBe(true);
  });
});
