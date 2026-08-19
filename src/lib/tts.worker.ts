// Piper TTS worker — runs WASM inference off the main thread so the UI never
// freezes. Synthesizes chunks and caches WAVs in OPFS (#6) so previously
// generated audio plays instantly on replay.
//
// Protocol (main → worker):
//   { type: "download",   id, voiceId }
//   { type: "synthesize", id, voiceId, chunks: string[], bookId?, chunkIds? }
//   { type: "cancel" }
//
// When bookId + chunkIds are provided, the worker:
//   1. Computes textHash for each chunk
//   2. Checks OPFS for cached audio (skip synthesis if hit + hash matches)
//   3. Synthesizes only uncached chunks
//   4. Saves new WAVs to OPFS for next time
//
// Protocol (worker → main):
//   { type: "download-progress", id, loaded, total }
//   { type: "download-done",     id }
//   { type: "voice-ready",       id, voiceId }
//   { type: "chunk-done",        id, index, total, wav: ArrayBuffer, cached: boolean }
//   { type: "chunk-failed",      id, index, total, message }
//   { type: "synthesize-done",   id, ok, failed: number[], cancelled }
//   { type: "error",             id, message }
import * as tts from "@mintplex-labs/piper-tts-web";
import { audioLocal, readChunk, saveChunk, textHash } from "./audioStore";

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

async function handleSynthesize(
  id: number,
  voiceId: string,
  chunks: string[],
  bookId?: string,
  chunkIds?: string[],
): Promise<void> {
  cancelled = false;
  const failed: number[] = [];

  // When bookId + chunkIds are provided, check OPFS cache before synthesizing.
  // Chunks that have cached audio with a matching hash are loaded from disk
  // instead of running Piper — instant replay on subsequent listens.
  const useCache = bookId && chunkIds && chunkIds.length === chunks.length;
  const cachedAudio = useCache ? await audioLocal(bookId!) : new Map<string, string>();
  const hashes: (string | null)[] = useCache
    ? await Promise.all(chunks.map((text) => textHash(text)))
    : chunks.map(() => null);

  // Determine which chunks need synthesis vs. are cached.
  const needSynthesis: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (cancelled) break;
    const hash = hashes[i];
    const chunkId = chunkIds?.[i];
    if (useCache && hash && chunkId && cachedAudio.get(chunkId) === hash) {
      // Cache hit — load from OPFS, no Piper inference needed.
      const wav = await readChunk(bookId!, chunkId, hash);
      if (wav) {
        post({ type: "chunk-done", id, index: i, total: chunks.length, wav, cached: true }, [wav]);
        continue;
      }
      // File was listed but couldn't be read (race condition?) — fall through to synthesis.
    }
    needSynthesis.push(i);
  }

  if (cancelled) {
    post({ type: "synthesize-done", id, ok: 0, failed, cancelled });
    return;
  }

  // If everything was cached, we're done — no need to load the Piper model.
  if (needSynthesis.length === 0) {
    post({ type: "synthesize-done", id, ok: chunks.length, failed, cancelled });
    return;
  }

  // Load the model once before the loop so the first chunk's progress is real.
  await getSession(voiceId);
  post({ type: "voice-ready", id, voiceId });

  for (const index of needSynthesis) {
    if (cancelled) break;

    let lastError: Error | null = null;
    // One retry per chunk: failures are often transient (WASM memory, session
    // mid-init).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const wav = await synthesizeChunk(voiceId, chunks[index]);

        // Save to OPFS cache if we have a bookId + chunkId + hash.
        if (useCache && hashes[index] && chunkIds?.[index]) {
          await saveChunk(bookId!, chunkIds[index], hashes[index]!, wav).catch((err) => {
            console.warn(`[tts-worker] failed to cache chunk ${index + 1}:`, err);
          });
        }

        // Transfer the buffer (postMessage detaches it) to avoid copying.
        post({ type: "chunk-done", id, index, total: chunks.length, wav, cached: false }, [wav]);
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

// The worker is shared across documents (see ttsClient.ts) so the loaded
// model session can be reused, but download/synthesize state (session,
// cancelled, activeId) is module-global and assumes only one request runs at
// a time. Chain requests through this queue so a new document's synthesize
// call can't start until the previous document's has fully wound down —
// without it, two concurrent handleSynthesize() calls would race on that
// shared state (e.g. one call's `cancelled = false` reset racing the other's
// in-flight loop, or both driving the same WASM session at once).
let queue: Promise<void> = Promise.resolve();

self.addEventListener("message", (event: MessageEvent) => {
  const { type, id, voiceId, chunks, bookId, chunkIds } = event.data ?? {};

  if (type === "cancel") {
    cancelled = true;
    return;
  }

  queue = queue.then(async () => {
    activeId = id;
    try {
      if (type === "download") await handleDownload(id, voiceId);
      else if (type === "synthesize") await handleSynthesize(id, voiceId, chunks, bookId, chunkIds);
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
});
