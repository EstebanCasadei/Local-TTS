// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMp3Encoder } from "wasm-media-encoders";
import { encodeBook, estimateExport, exportFilename, pcmWav } from "./mp3Export";

function wav(sampleRate = 22050, samples = 22050, extraChunk = false) {
  const offset = extraChunk ? 56 : 44;
  const data = new ArrayBuffer(offset + samples * 2);
  const view = new DataView(data);
  view.setUint32(0, 0x46464952, true);
  view.setUint32(4, data.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true);
  view.setUint32(12, 0x20746d66, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  if (extraChunk) {
    view.setUint32(36, 0x4b4e554a, true);
    view.setUint32(40, 3, true);
  }
  view.setUint32(offset - 8, 0x61746164, true);
  view.setUint32(offset - 4, samples * 2, true);
  for (let i = 0; i < samples; i++)
    view.setInt16(
      offset + i * 2,
      Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000),
      true,
    );
  return data;
}

describe("MP3 export", () => {
  it("parses PCM with extra padded RIFF chunks and rejects corrupt or unsupported WAVs", () => {
    expect(pcmWav(wav(16000, 16000, true)).samples.length).toBe(16000);
    expect(() => pcmWav(new ArrayBuffer(3))).toThrow();
    const stereo = wav();
    new DataView(stereo).setUint16(22, 2, true);
    expect(() => pcmWav(stereo)).toThrow("mono");
    expect(() => pcmWav(wav().slice(0, 100))).toThrow("Truncated");
  });

  it("estimates missing audio from cached speech and includes inter-chunk gaps", () => {
    const estimate = estimateExport(["a".repeat(100), "b".repeat(100)], 10, 100, 1, 1000000);
    expect(estimate.seconds).toBeCloseTo(20.03);
    expect(estimate.bytes).toBe(Math.ceil(20.03 * 8000 + 4096));
    expect(estimate.exactDuration).toBe(false);
    expect(estimateExport(["a"], 10, 1, 1, 1000000).exactDuration).toBe(true);
  });

  it("uses one encoder in textual order and never offers a truncated book", async () => {
    const events: string[] = [];
    const encoder = {
      configure: vi.fn(),
      encode: vi.fn(() => new Uint8Array([1])),
      finalize: vi.fn(() => new Uint8Array([2])),
    };
    const read = async (index: number) => {
      events.push(`read:${index}`);
      if (index === 1) throw new Error("Missing audio");
      return wav(16000, 160);
    };
    await expect(
      encodeBook(
        3,
        read,
        encoder,
        () => {},
        (count) => events.push(`done:${count}`),
      ),
    ).rejects.toThrow("Missing audio");
    expect(events).toEqual(["read:0", "done:1", "read:1"]);
    expect(encoder.configure).toHaveBeenCalledOnce();
    expect(encoder.finalize).not.toHaveBeenCalled();
  });

  it("encodes a real single MP3 stream across two PCM chunks", async () => {
    const encoder = await createMp3Encoder();
    const parts: Uint8Array[] = [];
    const progress: number[] = [];
    await encodeBook(
      2,
      async () => wav(),
      encoder,
      (part) => {
        if (part.length) parts.push(part.slice());
      },
      (_, seconds) => progress.push(seconds),
    );
    expect(progress).toEqual([
      1 + Math.round(22050 * 0.03) / 22050,
      2 + Math.round(22050 * 0.03) / 22050,
    ]);
    const data = Buffer.concat(parts);
    expect(data.length).toBeGreaterThan(16000);
    expect(data.length).toBeLessThan(20000);
    expect(data[0]).toBe(0xff);
    expect(data[1] & 0xe0).toBe(0xe0);
  });

  it("rejects changing sample rates rather than mixing incompatible chunks", async () => {
    const encoder = {
      configure: vi.fn(),
      encode: vi.fn(() => new Uint8Array()),
      finalize: vi.fn(),
    };
    await expect(
      encodeBook(
        2,
        async (index) => wav(index ? 16000 : 22050, 10),
        encoder,
        () => {},
        () => {},
      ),
    ).rejects.toThrow("sample rate");
    expect(encoder.finalize).not.toHaveBeenCalled();
    expect(exportFilename('Libro: "uno"/dos')).toBe("Libro_ _uno__dos.mp3");
    expect(exportFilename("...")).toBe("Audiolibro.mp3");
  });
});
