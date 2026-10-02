import { afterEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_PARAMS } from "./narration/profiles";

const mocks = vi.hoisted(() => ({
  predict: vi.fn().mockResolvedValue(new Blob([new Uint8Array(100)])),
  classify: vi.fn().mockResolvedValue("question"),
  dispose: vi.fn(),
  post: vi.fn(),
  listener: null as ((event: { data: Record<string, unknown> }) => void) | null,
  save: vi.fn().mockResolvedValue(undefined),
  read: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
  cached: vi.fn().mockResolvedValue(new Map()),
  hash: vi.fn().mockResolvedValue("a1b2c3d4"),
}));

vi.mock("@mintplex-labs/piper-tts-web", () => ({
  TtsSession: { create: vi.fn().mockResolvedValue({ predict: mocks.predict }) },
  remove: vi.fn(),
}));
vi.mock("./voiceDownload", () => ({ downloadVoice: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./audioStore", () => ({
  audioLocal: mocks.cached,
  readChunk: mocks.read,
  saveChunk: mocks.save,
  textHash: mocks.hash,
}));
vi.mock("./narration/toneClient", () => ({
  ToneClient: class {
    classify = mocks.classify;
    dispose = mocks.dispose;
    onStatus = undefined;
  },
}));

afterEach(() => vi.unstubAllGlobals());

async function synthesize(narration: { enabled: boolean; personality: string }, cached = false) {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.cached.mockResolvedValue(cached ? new Map([["c0", "a1b2c3d4"]]) : new Map());
  vi.stubGlobal("self", {
    postMessage: mocks.post,
    addEventListener: (_name: string, listener: typeof mocks.listener) => {
      mocks.listener = listener;
    },
  });
  await import("./tts.worker");
  mocks.listener!({
    data: {
      type: "synthesize",
      id: 1,
      voiceId: "voice",
      chunks: ["¿Vienes?"],
      bookId: "book",
      chunkIds: ["c0"],
      narration,
    },
  });
  await vi.waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ type: "synthesize-done" })),
  );
}

describe("narration synthesis integration", () => {
  it("keeps disabled synthesis neutral without invoking the classifier", async () => {
    await synthesize({ enabled: false, personality: "suspense" });
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.predict).toHaveBeenCalledWith("¿Vienes?", NEUTRAL_PARAMS);
    expect(mocks.save).toHaveBeenCalledWith(
      "book",
      "c0",
      "a1b2c3d4",
      expect.any(ArrayBuffer),
      "voice",
    );
  });
  it("applies parameters to Piper and sends personality gaps with decoded chunks", async () => {
    await synthesize({ enabled: true, personality: "suspense" });
    expect(mocks.predict).toHaveBeenCalledWith("¿Vienes?", {
      lengthScale: 1.1,
      noiseScale: 0.75,
      noiseWScale: 0.9,
    });
    expect(mocks.hash).toHaveBeenCalledWith(expect.stringContaining("adaptive-v1"), "voice");
    expect(mocks.save).toHaveBeenCalledWith(
      "book",
      "c0",
      "a1b2c3d4",
      expect.any(ArrayBuffer),
      "voice~adaptive-suspense",
    );
    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chunk-done",
        profile: expect.objectContaining({ gapMs: 600 }),
      }),
      expect.any(Array),
    );
  });
  it("replays adaptive cached audio without loading Piper", async () => {
    await synthesize({ enabled: true, personality: "story" }, true);
    expect(mocks.predict).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledWith("book", "c0", "a1b2c3d4", "voice~adaptive-story");
    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chunk-done",
        cached: true,
        profile: expect.objectContaining({ gapMs: 400 }),
      }),
      expect.any(Array),
    );
  });
});
