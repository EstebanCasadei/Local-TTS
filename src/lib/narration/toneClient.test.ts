import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToneClient } from "./toneClient";
import { kvGet, kvSet } from "../localDb";

vi.mock("../localDb", () => ({ kvGet: vi.fn(), kvSet: vi.fn().mockResolvedValue(undefined) }));

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    MockWorker.instances.push(this);
  }
  receive(data: Record<string, unknown>) {
    this.onmessage?.({ data });
  }
}

describe("ToneClient budgets and lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(kvGet).mockResolvedValue(undefined);
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("classifies clear punctuation without starting or downloading a model", async () => {
    const client = new ToneClient();
    expect(await client.classify("¿Vienes?")).toBe("question");
    expect(MockWorker.instances).toHaveLength(0);
  });

  it("loads in the background and reuses saved decisions before downloading", async () => {
    const client = new ToneClient();
    vi.mocked(kvGet).mockResolvedValueOnce("calm");
    expect(await client.classify("El río avanza.")).toBe("calm");
    expect(MockWorker.instances).toHaveLength(0);
    expect(await client.classify("El sol apareció.")).toBe("neutral");
    expect(MockWorker.instances[0].postMessage).toHaveBeenCalledWith({ type: "load" });
    client.dispose();
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("bounds inference latency, prevents a backlog and caches late decisions", async () => {
    const client = new ToneClient();
    await client.classify("El río avanza.");
    const worker = MockWorker.instances[0];
    worker.receive({ type: "status", status: "ready" });
    vi.useFakeTimers();
    const first = client.classify("La puerta se abrió.");
    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "classify" }),
      ),
    );
    const message = worker.postMessage.mock.calls.at(-1)![0];
    expect(await client.classify("Una sombra apareció.")).toBe("neutral");
    expect(worker.postMessage.mock.calls.filter(([data]) => data.type === "classify")).toHaveLength(
      1,
    );
    await vi.advanceTimersByTimeAsync(750);
    expect(await first).toBe("neutral");
    worker.receive({ type: "result", id: message.id, category: "tension" });
    await Promise.resolve();
    expect(await client.classify("La puerta se abrió.")).toBe("tension");
    expect(kvSet).toHaveBeenCalledWith(expect.any(String), "tension");
    client.dispose();
  });

  it("cancels in-flight inference and does not persist stale results", async () => {
    const client = new ToneClient();
    await client.classify("El río avanza.");
    const worker = MockWorker.instances[0];
    worker.receive({ type: "status", status: "ready" });
    const result = client.classify("La puerta se abrió.");
    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "classify" }),
      ),
    );
    client.dispose();
    expect(await result).toBe("neutral");
    expect(kvSet).not.toHaveBeenCalled();
  });
});
