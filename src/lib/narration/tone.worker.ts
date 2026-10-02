import { TONE_LABELS, TONE_MODEL, selectTone, type ClassificationResult } from "./protocol";

type Classifier = ((
  text: string,
  labels: string[],
  options: Record<string, unknown>,
) => Promise<ClassificationResult>) & { dispose(): Promise<void> };
let classifier: Classifier | null = null;
let queue = Promise.resolve();
const post = self.postMessage.bind(self) as (message: unknown) => void;

async function load(): Promise<void> {
  try {
    // Keep the runtime and 338 MB model out of the neutral path entirely.
    if (!("gpu" in navigator)) throw new Error("WebGPU unavailable");
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (deviceMemory != null && deviceMemory < 4) throw new Error("Insufficient memory budget");
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = true;
    env.localModelPath = "/models/";
    env.useBrowserCache = true;
    classifier = (await pipeline("zero-shot-classification", TONE_MODEL, {
      device: "webgpu",
      dtype: "q8",
      progress_callback: (value: { status: string; progress?: number }) => {
        if (value.status === "progress")
          post({ type: "status", status: "loading", progress: value.progress });
      },
    })) as unknown as Classifier;
    post({ type: "status", status: "ready" });
  } catch {
    post({ type: "status", status: "fallback" });
  }
}

self.addEventListener(
  "message",
  ({ data }: MessageEvent<{ type: string; id: number; text: string }>) => {
    if (data.type === "load") {
      queue = queue.then(load);
      return;
    }
    if (data.type !== "classify") return;
    queue = queue.then(async () => {
      try {
        if (!classifier) throw new Error("Classifier unavailable");
        const result = await classifier(data.text, Object.values(TONE_LABELS), {
          hypothesis_template: "{}",
          multi_label: false,
          truncation: true,
        });
        post({ type: "result", id: data.id, category: selectTone(result) });
      } catch {
        post({ type: "result", id: data.id, category: "neutral", failed: true });
        post({ type: "status", status: "fallback" });
      }
    });
  },
);
