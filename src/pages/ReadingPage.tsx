import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { MenuItem } from "../components/library/BookMenu.tsx";
import { BookMenu } from "../components/library";
import {
  AudioPanel,
  KaraokeText,
  PlaybackControls,
  ReadingHeader,
  VoiceSphere,
  VoicesPanel,
} from "../components/reading";
import { useBook } from "../hooks/useBook.ts";
import { useProgress } from "../hooks/useProgress.ts";
import { useTts } from "../hooks/useTts.ts";
import { getBookRepository } from "../lib/books";
import { formatDuration } from "../lib/audio";
import BookmarkIcon from "../icons/BookmarkIcon.svg?react";
import ChevronUpIcon from "../icons/ChevronUpIcon.svg?react";
import MusicIcon from "../icons/MusicIcon.svg?react";
import SleepIcon from "../icons/SleepIcon.svg?react";

/** Alto de la pestaña con la flecha: es lo único que asoma con el panel cerrado. */
const HANDLE_HEIGHT = "2.25rem";

const MENU_BUTTON =
  "grid size-10 cursor-pointer list-none place-items-center rounded-full shadow-large bg-bg-secondary text-text-primary border border-border-primary transition duration-150 hover:bg-bg-tertiary active:scale-95";

export function ReadingPage() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get("book");

  const { chunks, progress, loading } = useBook(bookId);
  const tts = useTts();
  const [panel, setPanel] = useState<"voices" | "audio" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [bookTitle, setBookTitle] = useState<string>("");
  const progressRef = useRef(progress);

  // Keep progressRef in sync so handleRead always sees the latest saved progress.
  progressRef.current = progress;

  // Load book metadata for the header
  useEffect(() => {
    if (!bookId) return;
    getBookRepository()
      .getBook(bookId)
      .then((book) => {
        if (book) setBookTitle(book.titulo);
      });
  }, [bookId]);

  // Repository chunk texts — used directly as synthesis chunks so they align
  // 1:1 with chunk IDs. This makes progress saving/resume trivial: the queue's
  // activeChunkIndex maps directly to a repository chunk ID.
  const chunkTexts = useMemo(() => chunks.map((c) => c.texto), [chunks]);
  const chunkIds = useMemo(() => chunks.map((c) => c.id), [chunks]);

  // Full text (for synthesize) and karaoke chunks. Before play, use the
  // repository chunk texts directly — NOT chunkText(allText), which re-splits
  // the joined text and produces different chunk boundaries. After play,
  // tts.synthesisChunks is the same data (passed via preChunked).
  const allText = useMemo(() => chunkTexts.join("\n"), [chunkTexts]);
  const karaokeChunks = useMemo(
    () => (tts.synthesisChunks.length > 0 ? tts.synthesisChunks : chunkTexts),
    [tts.synthesisChunks, chunkTexts],
  );

  // Debounced progress saving during playback.
  useProgress({
    bookId,
    chunkIds,
    activeChunkIndex: tts.activeChunkIndex,
    position: tts.currentPosition,
    isPlaying: tts.isPlaying,
  });

  // When chunks load and TTS is idle, synthesize them.
  // Pass chunkTexts directly as preChunked so synthesis chunks = repository
  // chunks (1:1 mapping for progress). Pass bookId + chunkIds so the worker
  // can check the OPFS cache and skip synthesis for already-generated audio.
  const handleRead = () => {
    if (chunks.length === 0) return;
    tts.reset();

    // Find the resume position from saved progress.
    const saved = progressRef.current;
    let resumeFrom: { chunkIndex: number; globalPosition: number } | undefined;
    if (saved && saved.chunkActualId) {
      const idx = chunkIds.indexOf(saved.chunkActualId);
      if (idx >= 0 && saved.offsetSegundos > 0) {
        resumeFrom = { chunkIndex: idx, globalPosition: saved.offsetSegundos };
      }
    }

    void tts.synthesize(allText, bookId ?? undefined, chunkIds, chunkTexts, resumeFrom);
  };

  const menuItems: MenuItem[] = [
    { label: "Marcadores", icon: BookmarkIcon },
    {
      label: "Música/sonido ambiente",
      icon: MusicIcon,
      onSelect: () => setPanel("audio"),
    },
    { label: "Programar descanso", icon: SleepIcon },
  ];

  // No book selected — show empty state
  if (!bookId) {
    return (
      <main className="bg-bg-tertiary flex min-h-screen min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="font-h2 text-text-secondary">
          No se seleccionó ningún documento. Vuelve a la biblioteca para elegir uno.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="bg-bg-tertiary flex min-h-screen min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="font-h2 text-text-secondary">Cargando documento…</p>
      </main>
    );
  }

  if (chunks.length === 0) {
    return (
      <main className="bg-bg-tertiary flex min-h-screen min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="font-h2 text-text-secondary">Este documento no tiene contenido para leer.</p>
      </main>
    );
  }

  const format = chunks[0]?.capituloId != null ? "TXT" : "TXT";
  const estimate = `Est. ${Math.ceil(chunks.length * 0.5)} min`;
  const voiceName = tts.voices.find((v) => v.id === tts.voiceId)?.label ?? "Voz";

  // Show saved progress whenever there's no real audio loaded yet (duration
  // is 0 and position is 0). This covers both idle AND the download/synthesis
  // phase after clicking play — without it, the position flashes to 0:00
  // during voice download before the resume seek kicks in.
  const isIdle = tts.status === "idle" || tts.status === "error" || tts.status === "done";
  const savedPosition = progress?.offsetSegundos ?? 0;
  const noAudioYet = tts.duration === 0 && tts.currentPosition === 0;
  const showSaved = noAudioYet && savedPosition > 0;
  const displayPosition = showSaved ? savedPosition : tts.currentPosition;
  const savedChunkIndex = progress
    ? Math.max(0, parseInt(progress.chunkActualId.replace(/^c/, ""), 10) || 0)
    : 0;

  // When idle with no audio loaded, tts.duration is 0. We can't do word-level
  // highlighting without real timing data, so we pass initialChunkIndex to
  // highlight the saved chunk (sentence) and scroll to it. Word-level
  // highlighting kicks in once audio is playing.
  const displayDuration = tts.duration;

  const displayProgressPercent =
    tts.duration > 0
      ? (tts.currentPosition / tts.duration) * 100
      : showSaved && chunks.length > 0
        ? (savedChunkIndex / chunks.length) * 100
        : 0;

  return (
    <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-bg-tertiary">
      {/* Menú fijo, visible incluso cuando sube el panel de texto. */}
      <div className="fixed top-4 right-4 z-50">
        <BookMenu className={MENU_BUTTON} extraItems={menuItems} iconClassName="size-6" />
      </div>

      {/* Escenario: título + esfera detrás; el panel de texto sube y los tapa. */}
      <div className="relative min-h-[26rem] flex-1 overflow-hidden">
        <div className="absolute inset-0 flex flex-col p-4 pt-16 md:p-8 md:pt-8">
          <ReadingHeader title={bookTitle || "Documento"} format={format} estimate={estimate} />
          <div className="grid flex-1 place-items-center py-4">
            <VoiceSphere />
          </div>
        </div>

        <div
          className="absolute inset-0 flex flex-col transition-transform duration-300 ease-out"
          style={{
            transform: expanded ? undefined : `translateY(calc(100% - ${HANDLE_HEIGHT}))`,
          }}
        >
          <button
            aria-expanded={expanded}
            aria-label={expanded ? "Ocultar el texto" : "Mostrar el texto"}
            className="grid shrink-0 cursor-pointer place-items-center border-t border-border-primary bg-bg-primary text-text-primary transition duration-150 hover:bg-bg-secondary"
            onClick={() => setExpanded((prev) => !prev)}
            style={{ height: HANDLE_HEIGHT }}
            type="button"
          >
            <ChevronUpIcon
              className={`size-5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          <section
            className="flex min-h-0 flex-1 flex-col gap-4 bg-bg-primary p-4 md:p-8"
            inert={!expanded}
          >
            <div className="mx-auto max-w-[1100px] w-full">
              <ReadingHeader
                chapter="Contenido"
                estimate={estimate}
                format={format}
                showChapter={expanded}
                title={bookTitle || "Documento"}
              />

              <div className="min-h-0 flex-1 mt-4">
                <KaraokeText
                  chunkStartTimes={tts.chunkStartTimes}
                  chunks={karaokeChunks}
                  duration={displayDuration}
                  initialChunkIndex={showSaved ? savedChunkIndex : -1}
                  onSeek={tts.seek}
                  position={displayPosition}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* TTS synthesis progress overlay */}
      {(tts.status === "downloading-voice" ||
        tts.status === "synthesizing" ||
        tts.status === "buffering") && (
        <div className="bg-bg-secondary border-t border-border-primary px-4 py-2 text-center">
          <p className="font-p text-text-secondary">
            {tts.status === "downloading-voice"
              ? `Descargando voz… ${tts.downloadProgress != null ? `${Math.round(tts.downloadProgress * 100)}%` : ""}`
              : tts.status === "buffering"
                ? `Preparando audio… ${tts.chunksDone}/${tts.chunksTotal} fragmentos`
                : `Sintetizando… ${tts.chunksDone}/${tts.chunksTotal}`}
          </p>
        </div>
      )}

      {/* TTS error */}
      {tts.status === "error" && (
        <div className="bg-action-error/10 border-t border-action-error px-4 py-2 text-center">
          <p className="font-p text-action-error">{tts.error}</p>
          <button
            className="font-p mt-1 text-action-error underline"
            onClick={tts.reset}
            type="button"
          >
            Reintentar
          </button>
        </div>
      )}

      <PlaybackControls
        duration={tts.formatTotal()}
        isPlaying={tts.status === "playing"}
        onOpenVoices={() => setPanel("voices")}
        onSpeedChange={tts.setSpeed}
        onToggle={() => {
          if (isIdle) {
            handleRead();
          } else if (tts.status === "playing" || tts.status === "buffering") {
            tts.pause();
          } else if (tts.status === "paused") {
            tts.play();
          }
        }}
        position={formatDuration(displayPosition)}
        progressPercent={displayProgressPercent}
        speed={tts.speed}
        voiceName={voiceName}
      />

      <VoicesPanel
        onClose={() => setPanel(null)}
        open={panel === "voices"}
        selectedId={tts.voiceId}
      />
      <AudioPanel onClose={() => setPanel(null)} open={panel === "audio"} />
    </main>
  );
}
