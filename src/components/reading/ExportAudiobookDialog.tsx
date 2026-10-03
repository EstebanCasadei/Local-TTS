import { useEffect, useRef, useState } from "react";
import { Dialog } from "../Dialog";
import { ExportClient } from "../../lib/exportClient";
import {
  exportFilename,
  MAX_EXPORT_BYTES,
  requiredExportSpace,
  type ExportBook,
  type ExportEstimate,
  type ExportProgress,
} from "../../lib/mp3Export";
import { formatDuration } from "../../lib/audio";

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const BUTTON =
  "cursor-pointer rounded-lg bg-action-primary px-3 py-2 text-text-primary disabled:cursor-not-allowed disabled:opacity-50";

export function ExportAudiobookDialog({
  open,
  book,
  title,
  voiceName,
  voiceSize,
  onPause,
  onClose,
}: {
  open: boolean;
  book: ExportBook;
  title: string;
  voiceName: string;
  voiceSize: string;
  onPause: () => Promise<void>;
  onClose: () => void;
}) {
  const clientRef = useRef<ExportClient | null>(null);
  const [estimate, setEstimate] = useState<ExportEstimate | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [status, setStatus] = useState<"checking" | "idle" | "running" | "done" | "error">(
    "checking",
  );
  const [error, setError] = useState("");
  const [file, setFile] = useState<{ url: string; size: number } | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    const client = new ExportClient();
    clientRef.current = client;
    setStatus("checking");
    setEstimate(null);
    setProgress(null);
    setError("");
    setFile(null);
    void client
      .inspect(book)
      .then((value) => {
        if (!current) return;
        setEstimate(value);
        setStatus("idle");
      })
      .catch(() => {
        if (current) {
          setError(
            "No se pudo comprobar el audio local. Se necesita un navegador con almacenamiento local OPFS habilitado y espacio disponible.",
          );
          setStatus("error");
        }
        void client.dispose();
      });
    return () => {
      current = false;
      clientRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      void client.dispose();
    };
  }, [open, book]);

  useEffect(() => {
    if (status !== "running" || !open) return;
    const preventLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [status, open]);

  const start = async () => {
    const client = clientRef.current;
    if (!client || status !== "idle") return;
    setStatus("running");
    try {
      await onPause();
      if (clientRef.current !== client) return;
      const result = await client.run(book, (value) => {
        if (clientRef.current === client) setProgress(value);
      });
      if (clientRef.current !== client) return;
      const url = URL.createObjectURL(result);
      urlRef.current = url;
      setFile({ url, size: result.size });
      setStatus("done");
    } catch (reason) {
      if (clientRef.current !== client) return;
      setError(reason instanceof Error ? reason.message : "No se pudo exportar el audiolibro.");
      setStatus("error");
      await client.dispose();
    }
  };
  const blocked =
    !estimate ||
    estimate.bytes > MAX_EXPORT_BYTES ||
    estimate.freeBytes < requiredExportSpace(estimate);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Descargar audiolibro MP3"
      footer={
        <>
          <button className={BUTTON} onClick={onClose}>
            {status === "running" ? "Cancelar exportación" : "Cerrar"}
          </button>
          {status === "idle" && (
            <button className={BUTTON} disabled={blocked} onClick={() => void start()}>
              Preparar MP3
            </button>
          )}
          {status === "done" && file && (
            <a className={BUTTON} href={file.url} download={exportFilename(title)}>
              Descargar MP3
            </a>
          )}
        </>
      }
    >
      <div
        className="brand-scrollbar max-h-[65dvh] overflow-y-auto space-y-3 text-text-primary font-label"
        aria-live="polite"
      >
        <p>
          <strong>{voiceName}</strong> · Velocidad normal (1×) · Mono, 64 kbps · Sin audio ambiente.
        </p>
        {status === "checking" && (
          <p>Comprobando los fragmentos disponibles en este dispositivo…</p>
        )}
        {estimate && (
          <>
            <p>
              Duración {estimate.exactDuration ? "del audio disponible" : "estimada"}:{" "}
              {formatDuration(estimate.seconds)}. Tamaño MP3 aproximado: {mb(estimate.bytes)} (unos
              28,8 MB por hora).
            </p>
            <p>
              {estimate.cached} de {estimate.total} fragmentos disponibles; faltan{" "}
              {estimate.total - estimate.cached} por generar. Espacio local disponible estimado:{" "}
              {mb(estimate.freeBytes)}.
            </p>
            <p>
              Reserva local estimada necesaria: {mb(requiredExportSpace(estimate))}, incluyendo la
              voz si falta y un margen de seguridad. La descarga final también necesita espacio en
              tu carpeta de destino.
            </p>
            {estimate.bytes > MAX_EXPORT_BYTES && (
              <p role="alert">
                El tamaño estimado supera el límite de 256 MiB (268 MB). Usa un documento más corto.
              </p>
            )}
            {estimate.freeBytes < requiredExportSpace(estimate) && (
              <p role="alert">
                Espacio local insuficiente. Libera almacenamiento antes de exportar.
              </p>
            )}
          </>
        )}
        <p>
          La lectura y el audio ambiente se pausarán. Se conservará tu posición y podrás continuar
          después pulsando Reproducir.
        </p>
        <p>
          El proceso es local: reutiliza el audio guardado y genera lo que falta. Convierte un
          fragmento a la vez, con pausas breves entre ellos, y escribe el MP3 temporal en disco. No
          mantiene todos los WAV en memoria ni guarda los WAV nuevos de esta exportación.
        </p>
        <p>
          Puede consumir CPU y batería y calentar el dispositivo. Requiere espacio para el MP3
          temporal y para guardar la descarga; el navegador también puede usar memoria al descargar.
          Límite del archivo: 256 MiB.
        </p>
        <p>
          Si la voz no está guardada, se descargará primero (aprox. {voiceSize}). Los textos no se
          envían a un servidor. La descarga de la voz y del codificador requiere conexión; después
          la conversión se realiza en el dispositivo.
        </p>
        <p>
          Mantén esta página abierta y el dispositivo activo. Al cambiar de página o cancelar se
          pierde el MP3 parcial. La pestaña en segundo plano puede ralentizarse o detenerse,
          especialmente en móviles.
        </p>
        <p>
          No se puede prometer un tiempo antes de medir el equipo. El tiempo restante se estima tras
          los primeros fragmentos y puede variar según el audio disponible y el rendimiento.
        </p>
        {status === "running" && (
          <>
            <p>
              {!progress
                ? "Pausando la lectura y preparando la exportación…"
                : progress.phase === "loading"
                  ? "Preparando voz y generando audio…"
                  : progress.phase === "finalizing"
                    ? "Finalizando el MP3…"
                    : "Convirtiendo audio a MP3…"}
            </p>
            <progress
              aria-label="Progreso de exportación"
              max={progress?.total ?? 1}
              value={progress?.completed ?? 0}
              className="w-full"
            />
            {progress && (
              <p>
                {progress.completed}/{progress.total} fragmentos · {mb(progress.bytes)} escritos ·
                Restante:{" "}
                {progress.remainingSeconds == null
                  ? "calculando…"
                  : `aprox. ${formatDuration(progress.remainingSeconds)}`}
              </p>
            )}
            {progress?.downloadPercent != null && (
              <p>Descarga de voz: {progress.downloadPercent.toFixed(0)} %</p>
            )}
          </>
        )}
        {status === "done" && file && (
          <p>
            MP3 completo listo: {mb(file.size)}. Guarda el archivo con Descargar MP3. Espera a que
            la descarga termine antes de cerrar este diálogo; al cerrarlo se elimina la copia
            temporal. La lectura sigue pausada.
          </p>
        )}
        {status === "error" && (
          <p role="alert">
            {error} No se ofrecerá un archivo incompleto. Cierra el diálogo para volver a intentar.
          </p>
        )}
      </div>
    </Dialog>
  );
}
