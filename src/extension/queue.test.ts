import { describe, expect, it } from "vitest";
import {
  adjacentSelection,
  appendSelection,
  emptyQueue,
  MAX_QUEUE_ITEMS,
  MAX_SELECTION_CHARS,
  removeSelection,
  type SelectionItem,
} from "./queue";

const item = (id: string, text = "Texto de prueba."): SelectionItem => ({
  id,
  text,
  title: "Page",
  url: "https://example.com",
  tabId: 1,
  frameId: 0,
  highlightAvailable: true,
});

describe("selection queue", () => {
  it("appends selections without interrupting the active reading", () => {
    const queue = appendSelection(appendSelection(emptyQueue(), item("a")), item("b"));
    expect(queue.items.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(queue.activeId).toBe("a");
    expect(adjacentSelection(queue, 1)?.id).toBe("b");
    expect(adjacentSelection(queue, -1)).toBeUndefined();
  });
  it("selects the following item when removing the active reading", () => {
    const queue = ["a", "b", "c"].reduce(
      (previous, id) => appendSelection(previous, item(id)),
      emptyQueue(),
    );
    expect(removeSelection({ ...queue, activeId: "b" }, "b").activeId).toBe("c");
    expect(removeSelection({ ...queue, activeId: "c" }, "c").activeId).toBe("b");
    expect(removeSelection(queue, "b").activeId).toBe("a");
    expect(removeSelection(appendSelection(emptyQueue(), item("a")), "a").activeId).toBeNull();
  });
  it("bounds selection size, queue length and total retained text", () => {
    expect(() => appendSelection(emptyQueue(), item("a", " "))).toThrow();
    expect(() =>
      appendSelection(emptyQueue(), item("a", "x".repeat(MAX_SELECTION_CHARS + 1))),
    ).toThrow();
    const full = Array.from({ length: MAX_QUEUE_ITEMS }, (_, index) => item(String(index)));
    expect(() =>
      appendSelection({ items: full, activeId: "0", notice: null }, item("overflow")),
    ).toThrow();
    const large = Array.from({ length: 6 }, (_, index) =>
      item(String(index), "x".repeat(MAX_SELECTION_CHARS)),
    );
    expect(() =>
      appendSelection({ items: large, activeId: "0", notice: null }, item("overflow")),
    ).toThrow();
  });
});
