import { describe, it, expect } from "vitest";
import {
  joinHyphenated,
  collapseWhitespace,
  cleanBlockText,
  findRepeatedLines,
  clean,
  fullText,
} from "./textCleanup";
import type { RawDocument } from "./extract/types";

describe("joinHyphenated", () => {
  it("joins words broken by hyphen at end of line", () => {
    expect(joinHyphenated("compu-\ntadora")).toBe("computadora");
  });

  it("joins with spaces around the newline", () => {
    expect(joinHyphenated("compu- \n  tadora")).toBe("computadora");
  });

  it("does not join when second half starts with uppercase", () => {
    // "franco-\nAlemán" is a legitimate compound, not a line break
    expect(joinHyphenated("franco-\nAlemán")).toBe("franco-\nAlemán");
  });

  it("handles multiple hyphenated breaks", () => {
    expect(joinHyphenated("multi-\nlinea texto-\nlargo")).toBe("multilinea textolargo");
  });
});

describe("collapseWhitespace", () => {
  it("collapses multiple spaces into one", () => {
    expect(collapseWhitespace("hola    mundo")).toBe("hola mundo");
  });

  it("converts mid-sentence newlines to spaces", () => {
    expect(collapseWhitespace("hola\nmundo")).toBe("hola mundo");
  });

  it("preserves newlines after sentence-ending signs", () => {
    expect(collapseWhitespace("Fin de oración.\nNueva oración")).toBe(
      "Fin de oración.\nNueva oración",
    );
  });

  it("preserves newlines before uppercase (new paragraph)", () => {
    expect(collapseWhitespace("texto\nNueva línea")).toBe("texto\nNueva línea");
  });

  it("removes soft hyphens", () => {
    expect(collapseWhitespace("texto\u00adinvisible")).toBe("textoinvisible");
  });

  it("collapses multiple newlines into one", () => {
    expect(collapseWhitespace("texto\n\n\nmás")).toBe("texto\nmás");
  });

  it("trims leading and trailing whitespace", () => {
    expect(collapseWhitespace("  \n  hola  \n  ")).toBe("hola");
  });
});

describe("cleanBlockText", () => {
  it("removes standalone page number lines", () => {
    // "Texto" doesn't end with a sentence sign and "más" starts lowercase,
    // so the newline between them becomes a space (correct TTS behavior).
    expect(cleanBlockText("Texto\n12\nmás texto")).toBe("Texto más texto");
  });

  it("removes 'Página N' lines", () => {
    expect(cleanBlockText("Texto\nPágina 42\nmás texto")).toBe("Texto más texto");
  });

  it("joins hyphenated words and collapses whitespace", () => {
    expect(cleanBlockText("compu-\ntadora es un   texto")).toBe("computadora es un texto");
  });
});

describe("findRepeatedLines", () => {
  it("finds lines repeated across many pages", () => {
    const blocks = [
      { text: "Header\nBody 1", page: 1 },
      { text: "Footer", page: 1 },
      { text: "Header\nBody 2", page: 2 },
      { text: "Footer", page: 2 },
      { text: "Header\nBody 3", page: 3 },
      { text: "Footer", page: 3 },
      { text: "Header\nBody 4", page: 4 },
      { text: "Footer", page: 4 },
    ];
    const repeated = findRepeatedLines(blocks);
    expect(repeated.size).toBeGreaterThan(0);
    expect([...repeated][0]).toBe("header");
  });

  it("returns empty set for non-paginated docs (TXT)", () => {
    const blocks = [{ text: "Same line\nSame line\nSame line" }];
    expect(findRepeatedLines(blocks).size).toBe(0);
  });
});

describe("clean", () => {
  it("cleans a simple TXT document", () => {
    const raw: RawDocument = {
      kind: "txt",
      fileName: "test.txt",
      bytes: 100,
      meta: {},
      warnings: [],
      chapters: [
        {
          title: null,
          blocks: [{ text: "Hola mundo. Esto es un   test.\nNueva línea." }],
        },
      ],
    };
    const doc = clean(raw);
    expect(doc.kind).toBe("txt");
    expect(doc.fileName).toBe("test.txt");
    expect(doc.title).toBe("test");
    expect(doc.chapters).toHaveLength(1);
    expect(doc.chapters[0].title).toBe("Capítulo 1");
    expect(doc.chapters[0].text).toContain("Hola mundo.");
    expect(doc.chapters[0].text).not.toContain("  "); // no double spaces
  });

  it("derives title from filename when no meta title", () => {
    const raw: RawDocument = {
      kind: "txt",
      fileName: "my-document.txt",
      bytes: 50,
      meta: {},
      warnings: [],
      chapters: [{ title: null, blocks: [{ text: "Texto" }] }],
    };
    expect(clean(raw).title).toBe("my-document");
  });

  it("uses meta title when available", () => {
    const raw: RawDocument = {
      kind: "txt",
      fileName: "file.txt",
      bytes: 50,
      meta: { title: "El Título" },
      warnings: [],
      chapters: [{ title: null, blocks: [{ text: "Texto" }] }],
    };
    expect(clean(raw).title).toBe("El Título");
  });

  it("drops empty chapters and warns", () => {
    const raw: RawDocument = {
      kind: "txt",
      fileName: "test.txt",
      bytes: 50,
      meta: {},
      warnings: [],
      chapters: [
        { title: null, blocks: [{ text: "   " }] }, // empty
        { title: null, blocks: [{ text: "Real content" }] },
      ],
    };
    const doc = clean(raw);
    expect(doc.chapters).toHaveLength(1);
    expect(doc.chapters[0].text).toBe("Real content");
    expect(doc.warnings.some((w) => w.code === "EMPTY_CHAPTERS_DROPPED")).toBe(true);
  });
});

describe("fullText", () => {
  it("concatenates all chapter text", () => {
    const doc = clean({
      kind: "txt",
      fileName: "test.txt",
      bytes: 50,
      meta: {},
      warnings: [],
      chapters: [
        { title: null, blocks: [{ text: "Capítulo 1." }] },
        { title: null, blocks: [{ text: "Capítulo 2." }] },
      ],
    });
    expect(fullText(doc)).toBe("Capítulo 1.\nCapítulo 2.");
  });
});
