import { kvGet, kvSet } from "../localDb";
import { ruleTone, TONE_CATEGORIES, type ToneCategory } from "./profiles";
import { TONE_SCHEMA, type ModelUpdate } from "./protocol";

// Owned by the TTS worker. At most one GPU inference is in flight; a timeout
// returns neutral while the result can still populate the decision cache.
export class ToneClient {
  private worker: Worker | null = null;
  private status: ModelUpdate["status"] = "idle";
  private nextId = 0;
  private pending: { id: number; resolve: (category: ToneCategory) => void } | null = null;
  private decisions = new Map<string, ToneCategory>();
  private generation = 0;
  onStatus?: (update: ModelUpdate) => void;

  private warmup(): void {
    if (this.worker) return;
    try {
      this.status = "loading";
      this.onStatus?.({ status: "loading" });
      this.worker = new Worker(new URL("./tone.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        if (data.type === "status") {
          this.status = data.status;
          if (data.status === "fallback") {
            this.worker?.terminate();
            this.worker = null;
            this.pending?.resolve("neutral");
            this.pending = null;
          }
          this.onStatus?.({ status: data.status, progress: data.progress });
        } else if (data.type === "result" && data.id === this.pending?.id) {
          if (data.failed) this.status = "fallback";
          this.pending?.resolve(data.failed ? "neutral" : data.category);
          this.pending = null;
        }
      };
      this.worker.onerror = () => {
        this.status = "fallback";
        this.worker?.terminate();
        this.worker = null;
        this.pending?.resolve("neutral");
        this.pending = null;
        this.onStatus?.({ status: "fallback" });
      };
      this.worker.postMessage({ type: "load" });
    } catch {
      this.status = "fallback";
      this.onStatus?.({ status: "fallback" });
    }
  }

  async classify(text: string): Promise<ToneCategory> {
    const generation = this.generation;
    const rule = ruleTone(text);
    if (rule) return rule;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()));
    const key = `${TONE_SCHEMA}:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    const memory = this.decisions.get(key);
    if (memory) return memory;
    const stored = await kvGet<ToneCategory>(key).catch(() => undefined);
    if (generation !== this.generation) return "neutral";
    if (stored && TONE_CATEGORIES.includes(stored)) return stored;
    if (this.status === "fallback") return "neutral";
    this.warmup();
    if (this.status !== "ready" || this.pending) return "neutral";
    const result = new Promise<ToneCategory>((resolve) => {
      const id = ++this.nextId;
      this.pending = { id, resolve };
      this.worker!.postMessage({ type: "classify", id, text });
    }).then((category) => {
      if (generation !== this.generation || this.status === "fallback") return "neutral" as const;
      // Bounded memory; IndexedDB decisions survive worker disposal.
      if (this.decisions.size >= 512) this.decisions.delete(this.decisions.keys().next().value!);
      this.decisions.set(key, category);
      void kvSet(key, category).catch(() => {});
      return category;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        result,
        new Promise<ToneCategory>((resolve) => {
          timer = setTimeout(() => resolve("neutral"), 750);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  dispose(): void {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    this.pending?.resolve("neutral");
    this.pending = null;
    this.status = "idle";
    this.decisions.clear();
  }
}
