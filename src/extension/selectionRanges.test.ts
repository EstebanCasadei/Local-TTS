import { afterEach, describe, expect, it } from "vitest";
import { captureSelection, rangesForChunks, rangeText } from "./selectionRanges";
import { chunkText } from "../lib/chunker";

function select(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  return range;
}
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("page selection ranges", () => {
  it("maps repeated clauses to their original occurrences across inline markup", () => {
    document.body.innerHTML = "<p>Uno, <strong>dos.</strong> Uno, dos.</p>";
    const html = document.body.innerHTML;
    const source = select(document.querySelector("p")!);
    const chunks = chunkText(rangeText(source));
    const ranges = rangesForChunks(source, chunks);
    expect(ranges.map((range) => range?.toString().trim())).toEqual([
      "Uno,",
      "dos.",
      "Uno,",
      "dos.",
    ]);
    expect(ranges[0]!.startOffset).toBe(0);
    expect(ranges[2]!.startContainer).not.toBe(ranges[0]!.startContainer);
    expect(document.body.innerHTML).toBe(html);
  });
  it("preserves offsets for a partial selection with collapsed whitespace", () => {
    document.body.innerHTML = "<p>Before Hola,\u00a0  <em>mundo.</em> After</p>";
    const paragraph = document.querySelector("p")!;
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 7);
    range.setEnd(paragraph.querySelector("em")!.firstChild!, 6);
    const ranges = rangesForChunks(range, ["Hola,", " mundo."]);
    expect(ranges[0]!.toString()).toBe("Hola,");
    expect(ranges[1]!.toString()).toBe("mundo.");
  });
  it("keeps rendered paragraph boundaries and excludes hidden nodes", () => {
    document.body.innerHTML =
      '<article><p>Primero.</p><p style="display:none">Oculto.</p><p>Segundo.</p></article>';
    const range = select(document.querySelector("article")!);
    expect(rangeText(range)).toBe("Primero. Segundo.");
    expect(
      rangesForChunks(range, ["Primero.", "Segundo."]).map((entry) => rangeText(entry!)),
    ).toEqual(["Primero.", "Segundo."]);
  });
  it("preserves explicit line breaks within the same paragraph", () => {
    document.body.innerHTML = "<p>Primero.<br />Segundo.</p>";
    const range = select(document.querySelector("p")!);
    expect(rangeText(range)).toBe("Primero. Segundo.");
    expect(
      rangesForChunks(range, ["Primero.", "Segundo."]).map((entry) => rangeText(entry!)),
    ).toEqual(["Primero.", "Segundo."]);
  });
  it("does not anchor stale or editable selections", () => {
    document.body.innerHTML = '<p>Actual.</p><div contenteditable="true">Editable.</div>';
    select(document.querySelector("p")!);
    expect(captureSelection("Other.")).toBeNull();
    expect(captureSelection("Actual.")?.ranges).toHaveLength(1);
    select(document.querySelector("[contenteditable]")!);
    expect(captureSelection("Editable.")).toBeNull();
  });
  it("returns an unavailable anchor for text that cannot be mapped", () => {
    document.body.innerHTML = "<p>Original.</p>";
    expect(rangesForChunks(select(document.querySelector("p")!), ["Changed."])).toEqual([null]);
  });
});
