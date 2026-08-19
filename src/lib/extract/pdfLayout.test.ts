import { describe, it, expect } from "vitest";
import { buildPageLines, detectColumnSplit, groupPagesIntoChapters } from "./pdfLayout";
import type { PageLines, PdfTextItem } from "./pdfLayout";

/** Builds a fake pdfjs TextItem. x/y are baseline coordinates, in PDF user space. */
function item(str: string, x: number, y: number, fontSize = 10): PdfTextItem {
  return {
    str,
    transform: [fontSize, 0, 0, fontSize, x, y],
    width: str.length * fontSize * 0.5,
  };
}

describe("buildPageLines", () => {
  it("merges items on the same baseline into one line", () => {
    const items = [item("Hola", 0, 100), item("mundo", 40, 100)];
    const lines = buildPageLines(items, 300);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hola mundo");
  });

  it("keeps items on different baselines as separate lines, top to bottom", () => {
    const items = [item("Segunda linea", 0, 80), item("Primera linea", 0, 100)];
    const lines = buildPageLines(items, 300);
    expect(lines.map((l) => l.text)).toEqual(["Primera linea", "Segunda linea"]);
  });

  it("ignores blank items", () => {
    const items = [item("Hola", 0, 100), item("   ", 40, 100)];
    const lines = buildPageLines(items, 300);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hola");
  });

  it("reads a genuine two-column page left-column-first, top to bottom", () => {
    const pageWidth = 600;
    const items = [
      // Left column (x roughly 0-250)
      ...Array.from({ length: 5 }, (_, i) => item(`izq${i}`, 20, 700 - i * 20)),
      // Right column (x roughly 350-580)
      ...Array.from({ length: 5 }, (_, i) => item(`der${i}`, 360, 700 - i * 20)),
    ];
    const lines = buildPageLines(items, pageWidth);
    const texts = lines.map((l) => l.text);
    expect(texts.slice(0, 5)).toEqual(["izq0", "izq1", "izq2", "izq3", "izq4"]);
    expect(texts.slice(5)).toEqual(["der0", "der1", "der2", "der3", "der4"]);
  });

  it("keeps a single-column page in plain top-to-bottom order (no false column split)", () => {
    const items = [
      item("Titulo del documento", 20, 700),
      item("Primera linea del parrafo que ocupa todo el ancho de la pagina.", 20, 660),
      item("Segunda linea del parrafo, tambien a todo el ancho.", 20, 640),
    ];
    const lines = buildPageLines(items, 600);
    expect(lines.map((l) => l.text)).toEqual([
      "Titulo del documento",
      "Primera linea del parrafo que ocupa todo el ancho de la pagina.",
      "Segunda linea del parrafo, tambien a todo el ancho.",
    ]);
  });
});

describe("detectColumnSplit", () => {
  it("returns null for a single-column page", () => {
    const items = [item("Una linea normal de texto", 20, 700)];
    expect(detectColumnSplit(items, 600)).toBeNull();
  });

  it("returns the midpoint for a genuine two-column layout", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item(`izq${i}`, 20, 700 - i * 20)),
      ...Array.from({ length: 5 }, (_, i) => item(`der${i}`, 360, 700 - i * 20)),
    ];
    expect(detectColumnSplit(items, 600)).toBe(300);
  });

  it("returns null when a wide line spans across the middle of the page", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item(`izq${i}`, 20, 700 - i * 20)),
      ...Array.from({ length: 5 }, (_, i) => item(`der${i}`, 360, 700 - i * 20)),
      item("Un titulo que cruza todo el ancho de la pagina de lado a lado", 20, 720, 16),
    ];
    expect(detectColumnSplit(items, 600)).toBeNull();
  });
});

describe("groupPagesIntoChapters", () => {
  it("returns one chapter per page when no headings are found", () => {
    const pages: PageLines[] = [
      { pageNumber: 1, lines: [{ text: "Texto pagina 1", x: 0, xEnd: 100, y: 100, fontSize: 10 }] },
      { pageNumber: 2, lines: [{ text: "Texto pagina 2", x: 0, xEnd: 100, y: 100, fontSize: 10 }] },
    ];
    const chapters = groupPagesIntoChapters(pages);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toEqual({
      title: null,
      blocks: [{ text: "Texto pagina 1", page: 1 }],
    });
    expect(chapters[1].blocks[0].page).toBe(2);
  });

  it("starts a new chapter at each heading-sized line", () => {
    const pages: PageLines[] = [
      {
        pageNumber: 1,
        lines: [
          { text: "Capitulo Uno", x: 0, xEnd: 100, y: 700, fontSize: 20 },
          { text: "Cuerpo del capitulo uno.", x: 0, xEnd: 100, y: 680, fontSize: 10 },
          { text: "Mas cuerpo.", x: 0, xEnd: 100, y: 660, fontSize: 10 },
        ],
      },
      {
        pageNumber: 2,
        lines: [
          { text: "Capitulo Dos", x: 0, xEnd: 100, y: 700, fontSize: 20 },
          { text: "Cuerpo del capitulo dos.", x: 0, xEnd: 100, y: 680, fontSize: 10 },
        ],
      },
    ];
    const chapters = groupPagesIntoChapters(pages);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe("Capitulo Uno");
    expect(chapters[0].blocks).toEqual([
      { text: "Cuerpo del capitulo uno.\nMas cuerpo.", page: 1 },
    ]);
    expect(chapters[1].title).toBe("Capitulo Dos");
    expect(chapters[1].blocks).toEqual([{ text: "Cuerpo del capitulo dos.", page: 2 }]);
  });

  it("ignores standalone page numbers as headings even if enlarged", () => {
    const pages: PageLines[] = [
      {
        pageNumber: 1,
        lines: [
          { text: "1", x: 0, xEnd: 20, y: 700, fontSize: 20 },
          { text: "Primera linea del cuerpo.", x: 0, xEnd: 100, y: 680, fontSize: 10 },
          { text: "Segunda linea del cuerpo.", x: 0, xEnd: 100, y: 660, fontSize: 10 },
          { text: "Tercera linea del cuerpo.", x: 0, xEnd: 100, y: 640, fontSize: 10 },
        ],
      },
    ];
    const chapters = groupPagesIntoChapters(pages);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBeNull();
  });

  it("returns an empty array for no pages", () => {
    expect(groupPagesIntoChapters([])).toEqual([]);
  });
});
