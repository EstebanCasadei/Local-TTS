import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTts } from "./useTts";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  synthesize: vi.fn(() => new Promise(() => {})),
  callbacks: null as null | { onNarrationStatus: (value: { status: string }) => void },
}));
vi.mock("../lib/ttsClient", () => ({
  VOICES: [{ id: "voice", label: "Voice" }],
  TtsClient: class {
    cancel = mocks.cancel;
    prioritize = vi.fn();
    synthesize(...args: unknown[]) {
      mocks.callbacks = args[2] as typeof mocks.callbacks;
      return mocks.synthesize(...(args as []));
    }
  },
}));

describe("narration preferences and request cancellation", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    vi.clearAllMocks();
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("persists styles without starting synthesis and preserves them across resets", () => {
    const { result } = renderHook(useTts);
    expect(result.current.narration.enabled).toBe(false);
    act(() => result.current.setNarration({ enabled: true, personality: "poetry" }));
    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(JSON.parse(store.get("local-tts:narration")!)).toEqual({
      enabled: true,
      personality: "poetry",
    });
    act(() => result.current.reset());
    expect(result.current.narration).toEqual({ enabled: true, personality: "poetry" });
  });

  it("cancels old requests on style change and ignores their late status events", () => {
    const { result } = renderHook(useTts);
    act(() => {
      void result.current.synthesize("A passage.", undefined, undefined, ["A passage."]);
    });
    const oldCallbacks = mocks.callbacks!;
    act(() => result.current.setNarration({ enabled: true, personality: "story" }));
    expect(mocks.cancel).toHaveBeenCalledOnce();
    act(() => oldCallbacks.onNarrationStatus({ status: "ready" }));
    expect(result.current.narrationModel.status).toBe("idle");
    act(() => {
      void result.current.synthesize("A passage.");
    });
    expect(mocks.synthesize.mock.calls.at(-1)?.at(-1)).toEqual({
      enabled: true,
      personality: "story",
    });
  });
});
