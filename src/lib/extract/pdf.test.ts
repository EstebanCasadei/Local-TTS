import { describe, it, expect } from "vitest";
// pdf.ts imports the pdfjs worker via `?url`, which vitest resolves via Vite's
// asset handling. We only exercise the pure getTextContentCompat helper with a
// fake ReadableStream — no pdfjs-dist, no DOMMatrix/canvas.
import { getTextContentCompat } from "./pdf";

/** Minimal page stub exposing only what getTextContentCompat touches. */
function makePage(
  chunks: { items: unknown[]; styles: Record<string, unknown>; lang: string | null }[],
  opts: { xfa?: boolean } = {},
) {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return {
    streamTextContent: () => stream,
    getTextContent: () => ({ items: [{ str: "xfa-text" }], styles: {}, lang: "xfa" }),
    _transport: opts.xfa ? { _htmlForXfa: true } : {},
  } as unknown as Parameters<typeof getTextContentCompat>[0];
}

describe("getTextContentCompat", () => {
  it("aggregates a multi-chunk stream into a single TextContent", async () => {
    const page = makePage([
      { items: [{ str: "a" }, { str: "b" }], styles: { serif: 1 }, lang: "en" },
      { items: [{ str: "c" }], styles: { mono: 2 }, lang: null },
    ]);

    const content = await getTextContentCompat(page);

    expect(content.items).toEqual([{ str: "a" }, { str: "b" }, { str: "c" }]);
    expect(content.styles).toEqual({ serif: 1, mono: 2 });
    expect(content.lang).toBe("en"); // first non-null lang wins, null doesn't overwrite
  });

  it("returns null lang when no chunk sets one", async () => {
    const page = makePage([{ items: [], styles: {}, lang: null }]);
    const content = await getTextContentCompat(page);
    expect(content.lang).toBeNull();
  });

  it("preserves the first lang and ignores later ones (??= semantics)", async () => {
    const page = makePage([
      { items: [], styles: {}, lang: "en" },
      { items: [], styles: {}, lang: "fr" },
    ]);
    const content = await getTextContentCompat(page);
    expect(content.lang).toBe("en");
  });

  it("handles an empty stream", async () => {
    const page = makePage([]);
    const content = await getTextContentCompat(page);
    expect(content.items).toEqual([]);
  });

  it("falls back to native getTextContent for XFA documents", async () => {
    const page = makePage([{ items: [{ str: "stream-text" }], styles: {}, lang: "en" }], {
      xfa: true,
    });
    const content = await getTextContentCompat(page);
    expect(content.items).toEqual([{ str: "xfa-text" }]);
    expect(content.lang).toBe("xfa");
  });
});
