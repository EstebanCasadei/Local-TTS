import type { ExportBook, ExportEstimate, ExportProgress } from "./mp3Export";
import { removeExport } from "./exportStorage";

export class ExportClient {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, (error: Error) => void>();
  private name: string | null = null;
  private disposed = false;

  constructor() {
    // Isolated from playback. The playback model is freed before export starts.
    this.worker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
  }

  private request(
    type: string,
    book: ExportBook,
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<Record<string, unknown>> {
    if (this.disposed) return Promise.reject(new Error("Export cancelled"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.pending.delete(id);
        this.worker.removeEventListener("message", message);
        this.worker.removeEventListener("error", failure);
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const failure = () => fail(new Error("No se pudo iniciar el procesador de exportación."));
      const message = (event: MessageEvent) => {
        const data = event.data;
        if (data?.id !== id) return;
        if (data.type === "error") fail(new Error(data.message));
        else if (data.type === "export-progress") onProgress?.(data.progress);
        else if (data.type === "export-inspected" || data.type === "export-done") {
          cleanup();
          resolve(data);
        }
      };
      this.pending.set(id, fail);
      this.worker.addEventListener("message", message);
      this.worker.addEventListener("error", failure);
      this.worker.postMessage({ type, id, ...book, outputName: this.name });
    });
  }

  async inspect(book: ExportBook): Promise<ExportEstimate> {
    return (await this.request("export-inspect", book)).estimate as ExportEstimate;
  }

  async run(book: ExportBook, onProgress: (progress: ExportProgress) => void): Promise<File> {
    this.name = `export-${crypto.randomUUID()}.mp3`;
    const file = (await this.request("export-mp3", book, onProgress)).file as File;
    this.worker.terminate(); // Release Piper and encoder memory while the file remains downloadable.
    return file;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    for (const fail of [...this.pending.values()]) fail(new Error("Export cancelled"));
    if (this.name) await removeExport(this.name);
  }
}
