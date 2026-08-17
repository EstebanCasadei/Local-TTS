import { useState } from "react";
import { useTts } from "../hooks/useTts.ts";

// Tracer bullet page (#5): text input → voice select → Read → Piper TTS → playback.
// Self-contained throwaway test harness — proves the WASM synthesis pipeline
// end-to-end. Uses standard Tailwind classes (no custom design tokens) so it
// works independently of the design system PR (#43). When the real reading UI
// (#14) lands, this page gets deleted and the engine hooks into ReadingPage.
//
// UX improvements over the PoC:
// - Voice download progress as a percentage bar (~60MB, first time only)
// - Synthesis progress as chunk N/total with a progress bar
// - Clear disabled states: "Read" is disabled while downloading/synthesizing
// - Play/pause preserves position (pause/resume, not restart)
// - Auto-play when synthesis completes
// - Error state with a retry button, not just a console log
// - Sample text pre-filled so the user can try it with one tap

const SAMPLE_TEXT =
  "La inteligencia artificial está transformando el mundo. " +
  "Cada día, nuevos avances nos acercan a máquinas que pueden pensar, " +
  "aprender y crear. ¿Estamos listos para este futuro? " +
  "Solo el tiempo lo dirá, pero una cosa es cierta: el cambio ya empezó.";

export function TracerPage() {
  const tts = useTts();
  const [text, setText] = useState(SAMPLE_TEXT);

  const canRead =
    text.trim().length > 0 && tts.status !== "downloading-voice" && tts.status !== "synthesizing";
  const isBusy = tts.status === "downloading-voice" || tts.status === "synthesizing";

  const handleRead = () => {
    tts.reset();
    void tts.synthesize(text);
  };

  const progressPercent =
    tts.downloadProgress != null
      ? Math.round(tts.downloadProgress * 100)
      : tts.chunksTotal > 0
        ? Math.round((tts.chunksDone / tts.chunksTotal) * 100)
        : 0;

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 overflow-y-auto bg-gray-950 p-4 pt-8 text-gray-100 md:justify-center">
      <header className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">Tracer TTS</h1>
        <p className="mt-1 text-sm text-gray-400">
          Escribe texto, elige una voz y escucha. Todo corre local en tu navegador.
        </p>
      </header>

      {/* Voice selection — pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {tts.voices.map((voice) => (
          <button
            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
              tts.voiceId === voice.id
                ? "border-indigo-400 bg-indigo-400/20 text-gray-100"
                : "border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
            disabled={isBusy}
            key={voice.id}
            onClick={() => tts.setVoice(voice.id)}
            type="button"
          >
            {voice.accent} · {voice.label}
          </button>
        ))}
      </div>

      {/* Text input */}
      <textarea
        className="min-h-[120px] w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-100 outline-none transition-colors focus:border-indigo-400 disabled:opacity-50"
        disabled={isBusy}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe o pega texto en español…"
        value={text}
      />

      {/* Action buttons */}
      <div className="flex w-full max-w-md gap-3">
        {tts.status === "playing" || tts.status === "paused" || tts.status === "ready" ? (
          <>
            <button
              className="flex-1 rounded-lg border border-indigo-400 bg-indigo-400/20 py-3 text-sm transition-colors hover:bg-indigo-400/30"
              onClick={tts.status === "playing" ? tts.pause : tts.play}
              type="button"
            >
              {tts.status === "playing" ? "⏸ Pausar" : "▶ Reproducir"}
            </button>
            <button
              className="rounded-lg border border-gray-700 px-4 py-3 text-sm text-gray-400 transition-colors hover:text-gray-200"
              onClick={tts.reset}
              type="button"
            >
              ↺ Reiniciar
            </button>
          </>
        ) : (
          <>
            <button
              className="flex-1 rounded-lg bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canRead}
              onClick={handleRead}
              type="button"
            >
              {isBusy ? "Generando…" : "🔊 Leer"}
            </button>
            {isBusy && (
              <button
                className="rounded-lg border border-red-400 px-4 py-3 text-sm text-red-400 transition-colors"
                onClick={tts.cancel}
                type="button"
              >
                ✕ Cancelar
              </button>
            )}
          </>
        )}
      </div>

      {/* Progress / status feedback */}
      {(isBusy || tts.status === "ready") && (
        <div className="w-full max-w-md">
          {tts.status === "downloading-voice" && (
            <div className="text-center">
              <p className="mb-2 text-sm text-gray-400">
                Descargando voz… {tts.downloadProgress != null ? `${progressPercent}%` : ""}
              </p>
              {tts.downloadProgress != null && (
                <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">~60MB · solo la primera vez</p>
            </div>
          )}

          {tts.status === "synthesizing" && (
            <div className="text-center">
              <p className="mb-2 text-sm text-gray-400">
                Sintetizando… {tts.chunksDone}/{tts.chunksTotal} fragmentos ({progressPercent}%)
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {tts.status === "ready" && (
            <div className="text-center">
              <p className="text-sm text-gray-200">
                ✓ {tts.chunksDone} fragmentos listos · {tts.formatTotal()}
              </p>
              {tts.chunksDone < tts.chunksTotal && (
                <p className="mt-1 text-xs text-gray-500">
                  {tts.chunksTotal - tts.chunksDone} fragmentos fallaron
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Playback position while playing/paused */}
      {(tts.status === "playing" || tts.status === "paused") && (
        <div className="w-full max-w-md text-center">
          <p className="text-sm text-gray-400">
            {tts.formatPosition()} / {tts.formatTotal()}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full bg-indigo-500"
              style={{
                width: `${tts.duration > 0 ? (tts.currentPosition / tts.duration) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {tts.status === "error" && (
        <div className="w-full max-w-md rounded-lg border border-red-400/50 bg-red-400/10 p-4 text-center">
          <p className="text-sm text-red-400">{tts.error}</p>
          <button
            className="mt-3 rounded-lg border border-red-400 px-4 py-2 text-sm text-red-400 transition-colors"
            onClick={tts.reset}
            type="button"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </main>
  );
}
