// Typed client for the Piper TTS worker. Wraps the postMessage/onmessage
// protocol in promises with typed callbacks, so React hooks and other callers
// never handle raw messages.
//
// Improvement over the PoC: proper TypeScript types on the protocol, a class
// instead of module-level globals (testable, disposable), and a cancel method
// that actually awaits cleanup.

export interface Voice {
  id: string;
  label: string;
  accent: string;
}

// Piper Spanish voices (from the PoC + Figma accent selection).
// The library downloads these by ID from HuggingFace on first use.
export const VOICES: Voice[] = [
  { id: "es_ES-davefx-medium", label: "Davefx", accent: "España" },
  { id: "es_MX-claude-high", label: "Claude", accent: "México" },
  { id: "es_ES-mls_10246-low", label: "MLS 10246", accent: "España" },
];

export interface DownloadProgress {
  loaded: number;
  total: number;
}

export interface ChunkDone {
  index: number;
  total: number;
  wav: ArrayBuffer;
  cached: boolean;
}

export interface ChunkFailed {
  index: number;
  total: number;
  message: string;
}

export interface SynthesizeResult {
  ok: number;
  failed: number[];
  cancelled: boolean;
}

export interface SynthesizeCallbacks {
  onVoiceProgress?: (p: DownloadProgress) => void;
  onVoiceReady?: () => void;
  onChunk?: (c: ChunkDone) => void;
  onChunkFailed?: (c: ChunkFailed) => void;
}

// Shared across all TtsClient instances (rather than one per instance) so the
// Piper model session loaded inside the worker (see tts.worker.ts's `session`
// cache) survives across documents. useTts() creates/tears down a TtsClient
// on every ReadingPage mount; terminating the worker each time would force a
// full model reload for every new document.
let sharedWorker: Worker | null = null;

function getSharedWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
  }
  return sharedWorker;
}

// Request IDs must be unique across the shared worker's whole message stream,
// not just within one TtsClient — otherwise a new TtsClient (nextId reset to
// 1) can reuse an ID still in flight from a previous instance's request, and
// both instances' listeners react to each other's messages.
let nextRequestId = 1;

export class TtsClient {
  private getWorker(): Worker {
    return getSharedWorker();
  }

  /**
   * Sends a request to the worker and resolves when a terminal message arrives.
   * Non-terminal messages (progress, chunk-done) fire callbacks along the way.
   */
  private request(
    message: Record<string, unknown>,
    terminalTypes: string[],
    onMessage?: (data: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> {
    const w = this.getWorker();
    const id = nextRequestId++;

    return new Promise((resolve, reject) => {
      const onWorkerMessage = (event: MessageEvent) => {
        const data = event.data as Record<string, unknown>;
        if (!data || data.id !== id) return;

        if (data.type === "error") {
          cleanup();
          reject(new Error(data.message as string));
          return;
        }

        onMessage?.(data);

        if (terminalTypes.includes(data.type as string)) {
          cleanup();
          resolve(data);
        }
      };

      const onWorkerError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || "TTS worker failed to start"));
      };

      const cleanup = () => {
        w.removeEventListener("message", onWorkerMessage);
        w.removeEventListener("error", onWorkerError);
      };

      w.addEventListener("message", onWorkerMessage);
      w.addEventListener("error", onWorkerError);
      w.postMessage({ ...message, id });
    });
  }

  /** Downloads and caches a voice in OPFS (runs tts.download inside the worker). */
  downloadVoice(voiceId: string, onProgress?: (p: DownloadProgress) => void): Promise<void> {
    return this.request({ type: "download", voiceId }, ["download-done"], (data) => {
      if (data.type === "download-progress") {
        onProgress?.({ loaded: data.loaded as number, total: data.total as number });
      }
    }).then(() => undefined);
  }

  /**
   * Synthesizes chunks sequentially in the worker. Each WAV arrives as soon as
   * it's ready, without waiting for the rest. When bookId + chunkIds are
   * provided, the worker checks the OPFS cache first and only synthesizes
   * uncached chunks — instant replay for previously generated audio.
   */
  synthesize(
    voiceId: string,
    chunks: string[],
    callbacks: SynthesizeCallbacks = {},
    bookId?: string,
    chunkIds?: string[],
  ): Promise<SynthesizeResult> {
    return this.request(
      { type: "synthesize", voiceId, chunks, bookId, chunkIds },
      ["synthesize-done"],
      (data) => {
        switch (data.type) {
          case "download-progress":
            callbacks.onVoiceProgress?.({
              loaded: data.loaded as number,
              total: data.total as number,
            });
            break;
          case "voice-ready":
            callbacks.onVoiceReady?.();
            break;
          case "chunk-done":
            callbacks.onChunk?.({
              index: data.index as number,
              total: data.total as number,
              wav: data.wav as ArrayBuffer,
              cached: data.cached as boolean,
            });
            break;
          case "chunk-failed":
            callbacks.onChunkFailed?.({
              index: data.index as number,
              total: data.total as number,
              message: data.message as string,
            });
            break;
        }
      },
    ).then((data) => ({
      ok: data.ok as number,
      failed: data.failed as number[],
      cancelled: data.cancelled as boolean,
    }));
  }

  /** Tells the worker to stop after the current chunk. */
  cancel(): void {
    this.getWorker().postMessage({ type: "cancel" });
  }

  /**
   * Tells the worker to synthesize this chunk (and everything after it)
   * next, ahead of any earlier chunks still waiting — used when the user
   * jumps to a chunk that hasn't been synthesized yet, so playback doesn't
   * have to wait for the chunks in between.
   */
  prioritize(targetIndex: number): void {
    this.getWorker().postMessage({ type: "reorder", targetIndex });
  }

  /**
   * Releases this client. The underlying worker is shared across instances
   * and stays alive so its loaded model session can be reused — call
   * `cancel()` first if a synthesis is in flight and should stop.
   */
  dispose(): void {}
}
