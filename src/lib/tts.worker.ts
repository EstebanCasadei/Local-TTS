// Piper TTS worker — runs WASM inference off the main thread so the UI never
// freezes. Minimal tracer-bullet scope: download voice → synthesize chunks →
// return WAVs. No tone classifier (#12), no OPFS persistence (#6) — those plug
// in later via extension points.
//
// Protocol (main → worker):
//   { type: "download",   id, voiceId }
//   { type: "synthesize", id, voiceId, chunks: string[] }
//   { type: "cancel" }
//
// Protocol (worker → main):
//   { type: "download-progress", id, loaded, total }
//   { type: "download-done",     id }
//   { type: "voice-ready",       id, voiceId }
//   { type: "chunk-done",        id, index, total, wav: ArrayBuffer }
//   { type: "chunk-failed",      id, index, total, message }
//   { type: "synthesize-done",   id, ok, failed: number[], cancelled }
//   { type: "error",             id, message }
import * as tts from "@mintplex-labs/piper-tts-web";

// In a worker, self is DedicatedWorkerGlobalScope with postMessage(message, transfer?).
// The tsconfig includes DOM (not WebWorker) for the app, so we cast to the worker
// signature to avoid the Window.postMessage overload mismatch.
const post = self.postMessage.bind(self) as (
  msg: Record<string, unknown>,
  transfer?: Transferable[],
) => void;

// CDN paths for ONNX runtime and Piper phonemize WASM.
// The library's defaults pin onnxruntime-web@1.18.0 on cdnjs, but the bundled
// JS API is 1.27.0 — the WASM binary must match the JS version or inference
// fails with "no available backend found". We pin the matching version here.
const ONNX_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
const PIPER_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";

const WASM_PATHS = {
  onnxWasm: ONNX_WASM_BASE,
  piperData: `${PIPER_WASM_BASE}.data`,
  piperWasm: `${PIPER_WASM_BASE}.wasm`,
};

// TtsSession is a singleton internally: if a different voiceId is requested,
// we reset _instance to force a reload of the ONNX model.
let session: tts.TtsSession | null = null;
let sessionVoiceId: string | null = null;
let cancelled = false;
let activeId: number | null = null;

async function getSession(voiceId: string): Promise<tts.TtsSession> {
  if (session && sessionVoiceId === voiceId) return session;

  // Reset the internal singleton so the new voice's model loads fresh.
  (tts.TtsSession as unknown as { _instance: unknown })._instance = null;
  session = await tts.TtsSession.create({
    voiceId,
    wasmPaths: WASM_PATHS,
    progress: (progress) =>
      post({
        type: "download-progress",
        id: activeId,
        loaded: progress.loaded,
        total: progress.total,
      }),
    logger: (text: string) => console.debug("[tts-worker]", text),
  });
  sessionVoiceId = voiceId;
  return session;
}

async function synthesizeChunk(voiceId: string, text: string): Promise<ArrayBuffer> {
  const activeSession = await getSession(voiceId);
  const wav = await activeSession.predict(text);

  // predict() can return undefined or an empty Blob when inference fails
  // silently (typically from input that's too long). Convert to an explicit
  // error so it doesn't reach playback as silence.
  if (!(wav instanceof Blob) || wav.size <= 44) {
    throw new Error(
      `predict() returned invalid result (${wav == null ? "undefined" : `${wav.size} bytes`}) for ${text.length} chars`,
    );
  }

  return wav.arrayBuffer();
}

async function handleDownload(id: number, voiceId: string): Promise<void> {
  await tts.download(voiceId, (progress) => {
    post({
      type: "download-progress",
      id,
      loaded: progress.loaded,
      total: progress.total,
    });
  });
  post({ type: "download-done", id });
}

async function handleSynthesize(id: number, voiceId: string, chunks: string[]): Promise<void> {
  cancelled = false;
  const failed: number[] = [];

  // Load the model once before the loop so the first chunk's progress is real.
  await getSession(voiceId);
  post({ type: "voice-ready", id, voiceId });

  for (let index = 0; index < chunks.length; index++) {
    if (cancelled) break;

    let lastError: Error | null = null;
    // One retry per chunk: failures are often transient (WASM memory, session
    // mid-init).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const wav = await synthesizeChunk(voiceId, chunks[index]);
        // Transfer the buffer (postMessage detaches it) to avoid copying.
        post({ type: "chunk-done", id, index, total: chunks.length, wav }, [wav]);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === 0) {
          console.warn(`[tts-worker] chunk ${index + 1} failed, retrying:`, lastError.message);
        }
      }
    }

    if (lastError) {
      failed.push(index);
      post({
        type: "chunk-failed",
        id,
        index,
        total: chunks.length,
        message: lastError.message,
      });
    }
  }

  post({
    type: "synthesize-done",
    id,
    ok: chunks.length - failed.length,
    failed,
    cancelled,
  });
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, id, voiceId, chunks } = event.data ?? {};

  if (type === "cancel") {
    cancelled = true;
    return;
  }

  activeId = id;
  try {
    if (type === "download") await handleDownload(id, voiceId);
    else if (type === "synthesize") await handleSynthesize(id, voiceId, chunks);
    else throw new Error(`Unknown message type: ${type}`);
  } catch (err) {
    console.error("[tts-worker]", err);
    post({
      type: "error",
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
