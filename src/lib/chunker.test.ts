import { describe, it, expect } from "vitest";
import { chunkText, splitSentences, splitClauses, MAX_CHUNK_CHARS } from "./chunker";

describe("chunkText", () => {
  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("splits a single sentence into one chunk", () => {
    expect(chunkText("Hola mundo.")).toEqual(["Hola mundo."]);
  });

  it("splits multiple sentences", () => {
    const result = chunkText("Primera oración. Segunda oración.");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Primera oración.");
    expect(result[1]).toBe("Segunda oración.");
  });

  it("handles Spanish text with ¿? punctuation", () => {
    const result = splitSentences("¿Cómo estás? Muy bien.");
    expect(result).toHaveLength(2);
  });

  it("splits paragraphs on newlines", () => {
    const result = chunkText("Primer párrafo.\n\nSegundo párrafo.");
    expect(result).toHaveLength(2);
  });

  it("clausulas granularity splits on commas", () => {
    const result = chunkText("Hola, mundo, esto es una prueba.", { granularity: "clausulas" });
    // Each clause separated by comma becomes its own chunk
    expect(result.length).toBeGreaterThan(1);
  });

  it("oraciones granularity groups sentences up to maxChars", () => {
    const result = chunkText("Oración corta. Otra corta.", {
      granularity: "oraciones",
      maxChars: 100,
    });
    // Both short sentences fit in one chunk
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Oración corta. Otra corta.");
  });

  it("respects maxChars limit for text with spaces", () => {
    // 30 words of ~10 chars each = ~300 chars, split at 100
    const longText = Array.from({ length: 30 }, (_, i) => `palabra${i}`).join(" ");
    const result = chunkText(longText, { maxChars: 100 });
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("cannot split a single unbreakable word exceeding maxChars", () => {
    // A single 300-char word with no spaces or punctuation can't be split
    // further — this is an expected edge case (no real word is this long).
    const longWord = "A".repeat(300);
    const result = chunkText(longWord, { maxChars: 100 });
    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(300);
  });

  it("handles text with newlines and carriage returns", () => {
    const result = chunkText("Línea uno.\r\nLínea dos.");
    expect(result).toHaveLength(2);
  });

  it("handles null/undefined input gracefully", () => {
    expect(chunkText(null as unknown as string)).toEqual([]);
    expect(chunkText(undefined as unknown as string)).toEqual([]);
  });
});

describe("splitClauses", () => {
  it("splits on commas", () => {
    const result = splitClauses("Hola, mundo, adiós", 220);
    expect(result).toEqual(["Hola,", "mundo,", "adiós"]);
  });

  it("splits on semicolons and colons", () => {
    const result = splitClauses("Uno; dos: tres", 220);
    expect(result.length).toBe(3);
  });

  it("splits on em-dashes and ellipses", () => {
    const result = splitClauses("Uno — dos … tres", 220);
    expect(result.length).toBe(3);
  });

  it("splits long clauses by words when exceeding maxChars", () => {
    const longClause = "palabra ".repeat(30).trim(); // ~210 chars
    const result = splitClauses(longClause, 50);
    for (const piece of result) {
      expect(piece.length).toBeLessThanOrEqual(50);
    }
  });

  it("returns single element for short input", () => {
    expect(splitClauses("Hola mundo", 220)).toEqual(["Hola mundo"]);
  });
});

describe("MAX_CHUNK_CHARS", () => {
  it("is 220", () => {
    expect(MAX_CHUNK_CHARS).toBe(220);
  });
});
