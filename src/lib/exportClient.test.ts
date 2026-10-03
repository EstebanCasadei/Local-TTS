import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportClient } from "./exportClient";
const mocks = vi.hoisted(() => ({ remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./exportStorage", () => ({ removeExport: mocks.remove }));
const book = { bookId: "book", voiceId: "voice", chunks: ["Text"], chunkIds: ["c0"] };
class FakeWorker extends EventTarget {
  static latest: FakeWorker;
  messages: Record<string, unknown>[] = [];
  terminate = vi.fn();
  constructor() {
    super();
    FakeWorker.latest = this;
  }
  postMessage(message: Record<string, unknown>) {
    this.messages.push(message);
  }
  emit(data: Record<string, unknown>) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("export worker lifetime", () => {
  it("terminates immediately on cancellation, rejects the request and cleans the partial file", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new ExportClient();
    const progress = vi.fn();
    const result = client.run(book, progress);
    const rejected = expect(result).rejects.toThrow("cancelled");
    const worker = FakeWorker.latest;
    const request = worker.messages[0];
    await client.dispose();
    await rejected;
    expect(worker.terminate).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith(request.outputName);
    worker.emit({ id: request.id, type: "export-progress", progress: {} });
    expect(progress).not.toHaveBeenCalled();
    await client.dispose();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("keeps the complete file until the dialog is closed but frees model memory immediately", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new ExportClient();
    const result = client.run(book, vi.fn());
    const worker = FakeWorker.latest;
    const file = new File(["mp3"], "complete.mp3");
    worker.emit({ id: worker.messages[0].id, type: "export-done", file });
    expect(await result).toBe(file);
    expect(worker.terminate).toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    await client.dispose();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
});
