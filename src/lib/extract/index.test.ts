import { describe, it, expect } from "vitest";
import { detectKind, extractDocument, ACCEPT_ATTRIBUTE } from "./index";
import { ExtractionError, ErrorCode } from "./types";

describe("detectKind", () => {
  it("detects .txt", () => {
    expect(detectKind(new File(["text"], "doc.txt"))).toBe("txt");
  });

  it("detects .md as txt", () => {
    expect(detectKind(new File(["text"], "doc.md"))).toBe("txt");
  });

  it("detects .pdf", () => {
    expect(detectKind(new File([""], "doc.pdf"))).toBe("pdf");
  });

  it("detects .epub", () => {
    expect(detectKind(new File([""], "doc.epub"))).toBe("epub");
  });

  it("detects by mimetype when extension is unknown", () => {
    const file = new File(["text"], "doc", { type: "text/plain" });
    expect(detectKind(file)).toBe("txt");
  });

  it("throws UNSUPPORTED_TYPE for unknown formats", () => {
    expect(() => detectKind(new File(["data"], "doc.xyz"))).toThrow(ExtractionError);
    expect(() => detectKind(new File(["data"], "doc.xyz"))).toThrow(
      expect.objectContaining({ code: ErrorCode.UNSUPPORTED_TYPE }),
    );
  });
});

describe("extractDocument", () => {
  it("extracts a .txt file", async () => {
    const file = new File(["Hola mundo. Esto es una prueba."], "test.txt", {
      type: "text/plain",
    });
    const doc = await extractDocument(file);
    expect(doc.kind).toBe("txt");
    expect(doc.title).toBe("test");
    expect(doc.chapters).toHaveLength(1);
    expect(doc.chapters[0].text).toContain("Hola mundo.");
  });

  it("throws EMPTY_DOCUMENT for a blank file", async () => {
    const file = new File(["   \n\n  "], "blank.txt", { type: "text/plain" });
    await expect(extractDocument(file)).rejects.toThrow(ExtractionError);
    await expect(extractDocument(file)).rejects.toMatchObject({
      code: ErrorCode.EMPTY_DOCUMENT,
    });
  });

  it("throws UNSUPPORTED_TYPE for PDF (not implemented yet)", async () => {
    const file = new File(["data"], "doc.pdf");
    await expect(extractDocument(file)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_TYPE,
    });
  });

  it("reports progress", async () => {
    const file = new File(["Texto de prueba."], "test.txt", { type: "text/plain" });
    const phases: string[] = [];
    await extractDocument(file, {
      onProgress: (p) => phases.push(p.phase),
    });
    expect(phases).toContain("reading");
    expect(phases).toContain("cleaning");
  });
});

describe("ACCEPT_ATTRIBUTE", () => {
  it("includes txt, md, pdf, epub", () => {
    expect(ACCEPT_ATTRIBUTE).toContain(".txt");
    expect(ACCEPT_ATTRIBUTE).toContain(".md");
    expect(ACCEPT_ATTRIBUTE).toContain(".pdf");
    expect(ACCEPT_ATTRIBUTE).toContain(".epub");
  });
});
