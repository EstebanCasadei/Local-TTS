// Custom streaming downloader for Piper voice models.
//
// Why not just use the bundled tts.download()? It buffers the whole ~60MB
// .onnx file in memory (an array of chunks) before writing it to OPFS in one
// shot, and its progress callback reports `total = 0` whenever the response
// has no Content-Length header (e.g. behind mobile carriers that transparently
// re-compress responses) — the UI then has nothing to show and the download
// has no timeout, so on slow/low-power devices it can look stuck at
// "Descargando voz…" indefinitely.
//
// This module fetches the same files (same OPFS cache layout, so the
// library's own model loader finds them already cached and skips network)
// but streams each chunk straight to disk and enforces a timeout.
import { HF_BASE, PATH_MAP } from "@mintplex-labs/piper-tts-web";

export interface VoiceDownloadProgress {
  loaded: number;
  total: number;
}

// Approximate .onnx size (bytes) for each voice currently offered in the UI
// (see VOICES in ttsClient.ts), measured against HF_BASE. Used only as a
// progress-bar fallback when the response has no Content-Length, so the user
// sees a (roughly accurate) percentage instead of nothing at all.
const FALLBACK_VOICE_SIZE: Record<string, number> = {
  "es_ES-davefx-medium": 63_201_294,
  "es_MX-claude-high": 63_122_309,
  "es_ES-mls_10246-low": 63_104_526,
};
// Typical size for a Piper "medium" voice, used if a future voiceId isn't in
// the table above.
const DEFAULT_FALLBACK_SIZE = 63_000_000;

// Aborts the download (and discards the partial file) if it stalls for
// longer than this, instead of leaving the user staring at "Descargando
// voz…" forever.
const DOWNLOAD_TIMEOUT_MS = 120_000;

async function getPiperDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("piper", { create: true });
}

function fileNameFor(url: string): string {
  return url.split("/").at(-1)!;
}

async function isCached(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

// Chromium's OPFS throws this when a handle/entry it cached in memory no
// longer matches what's on disk — e.g. a previous download left an orphaned
// write lock because the worker was terminated mid-write (see
// TtsClient.restartWorker(), called when the user switches voices while one
// is still downloading). Surfaces as: "An operation that depends on state
// cached in an interface object was made but the state had changed since it
// was read from disk."
function isStaleOpfsState(err: unknown): boolean {
  return err instanceof DOMException && err.name === "InvalidStateError";
}

/**
 * Streams `url` straight into an OPFS file (no full-response buffering),
 * reporting incremental progress. Falls back to `fallbackTotal` for the
 * progress denominator when the response has no Content-Length. Aborts (and
 * removes the partial file) after DOWNLOAD_TIMEOUT_MS.
 *
 * Retries once, after wiping the entry, if OPFS reports the file's on-disk
 * state no longer matches what a handle had cached (see isStaleOpfsState) —
 * otherwise that stale entry would keep failing every attempt until the user
 * manually clears site data.
 */
async function streamToOpfs(
  dir: FileSystemDirectoryHandle,
  url: string,
  fallbackTotal: number | undefined,
  onProgress?: (p: VoiceDownloadProgress) => void,
  retryOnStaleState = true,
): Promise<void> {
  const name = fileNameFor(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      writable = await handle.createWritable();
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`No se pudo descargar ${name} (HTTP ${res.status})`);
      }
      const contentLength = +(res.headers.get("Content-Length") ?? 0);
      const total = contentLength > 0 ? contentLength : (fallbackTotal ?? 0);
      let loaded = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        loaded += value.length;
        onProgress?.({ loaded, total });
      }
      await writable.close();
    } catch (err) {
      await writable?.abort().catch(() => {});
      await dir.removeEntry(name).catch(() => {});
      if (controller.signal.aborted) {
        throw new Error(
          `La descarga de ${name} tardó demasiado (más de ${DOWNLOAD_TIMEOUT_MS / 1000}s) y fue cancelada.`,
        );
      }
      if (retryOnStaleState && isStaleOpfsState(err)) {
        return await streamToOpfs(dir, url, fallbackTotal, onProgress, false);
      }
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Downloads (and caches in OPFS) the .onnx model + its .json config for
 * `voiceId`, unless already cached — skips network entirely if a previous
 * download already stored them. Progress is reported for the (large) .onnx
 * file only; the .json config is a few KB.
 */
export async function downloadVoice(
  voiceId: string,
  onProgress?: (p: VoiceDownloadProgress) => void,
): Promise<void> {
  const path = PATH_MAP[voiceId];
  if (!path) throw new Error(`Voz desconocida: ${voiceId}`);

  const dir = await getPiperDir();
  const onnxUrl = `${HF_BASE}/${path}`;
  const jsonUrl = `${onnxUrl}.json`;
  const onnxName = fileNameFor(onnxUrl);
  const jsonName = fileNameFor(jsonUrl);
  const fallbackTotal = FALLBACK_VOICE_SIZE[voiceId] ?? DEFAULT_FALLBACK_SIZE;

  const [onnxCached, jsonCached] = await Promise.all([
    isCached(dir, onnxName),
    isCached(dir, jsonName),
  ]);

  await Promise.all([
    onnxCached ? Promise.resolve() : streamToOpfs(dir, onnxUrl, fallbackTotal, onProgress),
    jsonCached ? Promise.resolve() : streamToOpfs(dir, jsonUrl, undefined),
  ]);
}
