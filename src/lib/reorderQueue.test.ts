import { describe, expect, it } from "vitest";
import { reorderQueue } from "./reorderQueue";

describe("reorderQueue", () => {
  it("moves the target and everything after it to the front", () => {
    expect(reorderQueue([0, 1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5, 0, 1, 2]);
  });

  it("is a no-op when the target is already at the front", () => {
    expect(reorderQueue([0, 1, 2], 0)).toEqual([0, 1, 2]);
  });

  it("leaves the order unchanged when the target isn't pending", () => {
    expect(reorderQueue([0, 1, 2], 5)).toEqual([0, 1, 2]);
  });

  it("handles a target that's the only remaining item", () => {
    expect(reorderQueue([4], 4)).toEqual([4]);
  });

  it("reorders correctly a second time after an earlier rotation (forward then back)", () => {
    // Jump forward to chapter starting at chunk 3 — same as the first test.
    const afterForward = reorderQueue([0, 1, 2, 3, 4, 5], 3);
    expect(afterForward).toEqual([3, 4, 5, 0, 1, 2]);

    // Now jump back to chunk 0. A value-based split (index >= 0) would match
    // every element and leave the array unchanged — 0 must actually move to
    // the front.
    const afterBack = reorderQueue(afterForward, 0);
    expect(afterBack).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
