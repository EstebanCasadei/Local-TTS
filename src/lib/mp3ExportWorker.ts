import { readChunk, textHash } from "./audioStore";
import { exportDirectory } from "./exportStorage";
import { voiceDownloadBytes } from "./voiceDownload";
import {
  encodeBook,
  estimateExport,
  MAX_EXPORT_BYTES,
  wavMetadata,
  requiredExportSpace,
  type ExportBook,
  type ExportProgress,
} from "./mp3Export";

type Post = (message: Record<string, unknown>) => void;
function validate(book: ExportBook): void {
  if (
    !book.bookId ||
    !book.voiceId ||
    !Array.isArray(book.chunks) ||
    book.chunks.length === 0 ||
    book.chunks.length !== book.chunkIds?.length ||
    book.chunks.some((text) => typeof text !== "string" || !text.trim())
  )
    throw new Error("El libro no contiene fragmentos válidos para exportar.");
}
async function cachedWav(book: ExportBook, index: number): Promise<ArrayBuffer | null> {
  try {
    const wav = await readChunk(
      book.bookId,
      book.chunkIds[index],
      await textHash(book.chunks[index].trim(), book.voiceId),
      book.voiceId,
    );
    if (wav) wavMetadata(wav);
    return wav;
  } catch {
    // A concurrent playback writer or corrupt cache must not become exported silence.
    // Regenerate this chunk after playback has been stopped.
    return null;
  }
}

export async function inspectExport(book: ExportBook) {
  validate(book);
  await exportDirectory();
  let cached = 0;
  let seconds = 0;
  let chars = 0;
  for (let index = 0; index < book.chunks.length; index++) {
    const wav = await cachedWav(book, index);
    if (!wav) continue;
    const pcm = wavMetadata(wav);
    seconds += pcm.sampleCount / pcm.sampleRate;
    chars += book.chunks[index].trim().length;
    cached++;
  }
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  const estimate = estimateExport(book.chunks, seconds, chars, cached, Math.max(0, quota - usage));
  if (cached < book.chunks.length) estimate.voiceBytes = await voiceDownloadBytes(book.voiceId);
  return estimate;
}

export async function runExport(
  id: number,
  book: ExportBook,
  outputName: string,
  synthesize: (text: string) => Promise<ArrayBuffer>,
  post: Post,
): Promise<void> {
  validate(book);
  if (!/^export-[\da-f-]+\.mp3$/.test(outputName)) throw new Error("Invalid export filename");
  const estimate = await inspectExport(book);
  if (estimate.bytes > MAX_EXPORT_BYTES)
    throw new Error("El MP3 estimado supera el límite de 256 MiB. Exporta un documento más corto.");
  if (estimate.freeBytes < requiredExportSpace(estimate))
    throw new Error(
      "No hay suficiente espacio local disponible. Libera almacenamiento e inténtalo de nuevo.",
    );
  const directory = await exportDirectory();
  const handle = await directory.getFileHandle(outputName, { create: true });
  const access = await (
    handle as unknown as {
      createSyncAccessHandle: () => Promise<{
        truncate: (size: number) => void;
        write: (data: Uint8Array, options: { at: number }) => number;
        flush: () => void;
        close: () => void;
      }>;
    }
  ).createSyncAccessHandle();
  let bytes = 0;
  let completed = 0;
  let seconds = 0;
  let processedChars = 0;
  let clock = performance.now();
  const totalChars = book.chunks.reduce((sum, text) => sum + text.trim().length, 0);
  const report = (phase: ExportProgress["phase"]) =>
    post({
      type: "export-progress",
      id,
      progress: {
        phase,
        completed,
        total: book.chunks.length,
        bytes,
        seconds,
        remainingSeconds:
          completed >= 3 && processedChars > 0
            ? Math.max(
                0,
                (((performance.now() - clock) / 1000) * (totalChars - processedChars)) /
                  processedChars,
              )
            : null,
      } satisfies ExportProgress,
    });
  try {
    access.truncate(0);
    // Dynamically loaded only for explicit export requests.
    const { createMp3Encoder } = await import("wasm-media-encoders");
    const encoder = await createMp3Encoder();
    report("encoding");
    await encodeBook(
      book.chunks.length,
      async (index) => {
        const cached = await cachedWav(book, index);
        if (cached) return cached;
        report("loading");
        const wav = await synthesize(book.chunks[index].trim());
        if (completed === 0) clock = performance.now();
        report("encoding");
        return wav;
      },
      encoder,
      (data) => {
        if (bytes + data.byteLength > MAX_EXPORT_BYTES)
          throw new Error("El archivo supera el límite de 256 MiB. Exportación cancelada.");
        if (data.byteLength === 0) return;
        // encode() returns a borrowed view; synchronous writes consume it before reuse.
        const written = access.write(data, { at: bytes });
        if (written !== data.byteLength)
          throw new Error("No se pudo guardar el MP3 completo: espacio insuficiente.");
        bytes += written;
      },
      (count, duration) => {
        processedChars += book.chunks[count - 1].trim().length;
        completed = count;
        seconds = duration;
        report("encoding");
      },
    );
    report("finalizing");
    access.flush();
  } finally {
    access.close();
  }
  const file = await handle.getFile();
  if (file.size === 0) throw new Error("El codificador no generó un MP3 válido.");
  post({ type: "export-done", id, file });
}
