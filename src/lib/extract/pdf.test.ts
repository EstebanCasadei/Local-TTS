import { describe, it, expect, afterEach } from "vitest";
import { polyfillReadableStreamAsyncIterator } from "./pdf";

describe("polyfillReadableStreamAsyncIterator", () => {
  // Save/restore the prototype so tests don't leak global state into each other.
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  const sym = Symbol.asyncIterator;
  const original = Object.getOwnPropertyDescriptor(proto, sym);

  afterEach(() => {
    if (original) {
      Object.defineProperty(proto, sym, original);
    } else {
      delete proto[sym];
    }
  });

  it("enables for-await-of on a ReadableStream that lacks native support", async () => {
    delete proto[sym];
    expect(proto[sym]).toBeUndefined();

    polyfillReadableStreamAsyncIterator();

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue("a");
        controller.enqueue("b");
        controller.enqueue("c");
        controller.close();
      },
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as string);
    }
    expect(chunks).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when asyncIterator already exists", () => {
    const existing = async function* () {};
    Object.defineProperty(proto, sym, { value: existing, configurable: true });

    polyfillReadableStreamAsyncIterator();

    expect(proto[sym]).toBe(existing);
  });

  it("releases the reader lock after iteration completes", async () => {
    delete proto[sym];
    polyfillReadableStreamAsyncIterator();

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(1);
        controller.close();
      },
    });

    for await (const _ of stream) {
      void _;
    }

    // After iteration, the stream should not be locked by our reader.
    expect(stream.locked).toBe(false);
  });
});
