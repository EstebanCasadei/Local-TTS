import { describe, it, expect } from "vitest";
import { textHash, fileName, parseFileName } from "./audioStore";

describe("textHash", () => {
  it("returns an 8-char hex string", async () => {
    const hash = await textHash("hola mundo");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic — same text produces same hash", async () => {
    const a = await textHash("texto de prueba");
    const b = await textHash("texto de prueba");
    expect(a).toBe(b);
  });

  it("different text produces different hash", async () => {
    const a = await textHash("texto uno");
    const b = await textHash("texto dos");
    expect(a).not.toBe(b);
  });

  it("handles empty string", async () => {
    const hash = await textHash("");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("fileName", () => {
  it("builds the cache filename format", () => {
    expect(fileName("c0001", "a1b2c3d4")).toBe("c0001.a1b2c3d4.wav");
  });
});

describe("parseFileName", () => {
  it("parses a valid cache filename", () => {
    expect(parseFileName("c0001.a1b2c3d4.wav")).toEqual({
      chunkId: "c0001",
      hash: "a1b2c3d4",
    });
  });

  it("returns null for non-wav files", () => {
    expect(parseFileName("readme.txt")).toBeNull();
  });

  it("returns null for wav files without hash", () => {
    expect(parseFileName("audio.wav")).toBeNull();
  });

  it("returns null for hash with wrong length", () => {
    expect(parseFileName("c0001.a1b2c3.wav")).toBeNull(); // 6 chars, not 8
  });

  it("handles chunkIds with hyphens", () => {
    expect(parseFileName("c0-0001.a1b2c3d4.wav")).toEqual({
      chunkId: "c0-0001",
      hash: "a1b2c3d4",
    });
  });
});
