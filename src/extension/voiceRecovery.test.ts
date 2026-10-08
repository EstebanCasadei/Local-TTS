import { afterEach, expect, it, vi } from "vitest";
import { downloadVoice } from "../lib/voiceDownload";

vi.mock("@mintplex-labs/piper-tts-web", () => ({
  HF_BASE: "https://models.test",
  PATH_MAP: { voice: "voice.onnx" },
}));
afterEach(() => vi.unstubAllGlobals());

it("redownloads empty voice files left by an interrupted worker", async () => {
  const handle = {
    getFile: async () => ({ size: 0 }),
    createWritable: async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }),
  };
  vi.stubGlobal("navigator", {
    storage: {
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({ getFileHandle: async () => handle }),
      }),
    },
  });
  const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", fetchMock);
  await downloadVoice("voice");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
