import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { MenuItem } from "../components/library/BookMenu.tsx";
import { BookMenu } from "../components/library";
import { ToastProgress, useToast } from "../components";
import {
  AudioPanel,
  KaraokeText,
  PlaybackControls,
  ReadingHeader,
  VoiceSphere,
  VoicesPanel,
} from "../components/reading";
import { useAmbientAudio } from "../hooks/useAmbientAudio.ts";
import { useBook } from "../hooks/useBook.ts";
import { useProgress } from "../hooks/useProgress.ts";
import { useTts } from "../hooks/useTts.ts";
import { getBookRepository } from "../lib/books";
import { ESTIMATED_CHARS_PER_SEC, formatDuration } from "../lib/audio";
import BookmarkIcon from "../icons/BookmarkIcon.svg?react";
import ChevronUpIcon from "../icons/ChevronUpIcon.svg?react";
import MusicIcon from "../icons/MusicIcon.svg?react";
import SleepIcon from "../icons/SleepIcon.svg?react";

/** Alto de la pestaña con la flecha: es lo único que asoma con el panel cerrado. */
const HANDLE_HEIGHT = "2.25rem";

const MENU_BUTTON =
  "grid size-10 cursor-pointer list-none place-items-center rounded-full shadow-large bg-bg-secondary text-text-primary border border-border-primary transition duration-150 hover:bg-bg-tertiary active:scale-95";

/** Id fijo: reusa el mismo toast en vez de apilar uno nuevo en cada actualización de progreso. */
const VOICE_DOWNLOAD_TOAST_ID = "voice-download";

export function ReadingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookId = searchParams.get("book");

  const { chunks, progress, capitulos, loading } = useBook(bookId);
  const tts = useTts();
  const ambient = useAmbientAudio();
  const { show: showToast, dismiss: dismissToast } = useToast();
  const [panel, setPanel] = useState<"voices" | "audio" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [bookTitle, setBookTitle] = useState<string>("");
  const [bookFormat, setBookFormat] = useState<string>("");
  const progressRef = useRef(progress);
  const lastVoiceIdRef = useRef<string | null>(null);

  // Keep progressRef in sync so handleRead always sees the latest saved progress.
  progressRef.current = progress;

  // Load book metadata for the header
  useEffect(() => {
    if (!bookId) return;
    getBookRepository()
      .getBook(bookId)
      .then((book) => {
        if (!book) return;
        setBookTitle(book.titulo);
        setBookFormat(book.formatoOriginal.toUpperCase());
      });
  }, [bookId]);

  // Voice model download progress lives in a toast (bottom-right) instead of
  // an inline banner, so it keeps notifying even if the user closes the
  // voices panel or navigates away while the model downloads in the background.
  useEffect(() => {
    if (tts.status !== "downloading-voice") {
      dismissToast(VOICE_DOWNLOAD_TOAST_ID);
      return;
    }
    const voiceLabel = tts.voices.find((v) => v.id === tts.downloadingVoiceId)?.label;
    showToast(
      <ToastProgress
        detail={voiceLabel}
        percent={tts.downloadProgress != null ? tts.downloadProgress * 100 : null}
        title="Descargando voz…"
      />,
      { id: VOICE_DOWNLOAD_TOAST_ID, dismissible: false },
    );
  }, [
    tts.status,
    tts.downloadingVoiceId,
    tts.downloadProgress,
    tts.voices,
    showToast,
    dismissToast,
  ]);

  // When the user switches voice mid-reading, re-synthesize the current
  // document with the new voice and resume from the exact same chunk/offset.
  // Earlier chunks are re-synthesized in the background thanks to the worker's
  // reorder queue; playback starts as soon as the resume chunk arrives.
  useEffect(() => {
    if (lastVoiceIdRef.current === null) {
      lastVoiceIdRef.current = tts.voiceId;
      return;
    }
    if (lastVoiceIdRef.current === tts.voiceId) return;
    if (chunkIds.length === 0 || chunkTexts.length === 0) {
      lastVoiceIdRef.current = tts.voiceId;
      return;
    }

    const resumeIndex = Math.min(tts.activeChunkIndex, chunkTexts.length - 1);
    const chunkStart = tts.chunkStartTimes[resumeIndex] ?? 0;
    const offsetLocal = Math.max(0, tts.currentPosition - chunkStart);
    const resumeFrom = { chunkIndex: resumeIndex, offsetLocal };
    lastVoiceIdRef.current = tts.voiceId;
    void tts.synthesize(allText, bookId ?? undefined, chunkIds, chunkTexts, resumeFrom);
    // This effect must only re-synthesize when the voice changes; the resume
    // position comes from the current tts snapshot at the moment of the change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.voiceId, tts.status]);

  // Repository chunk texts — used directly as synthesis chunks so they align
  // 1:1 with chunk IDs. This makes progress saving/resume trivial: the queue's
  // activeChunkIndex maps directly to a repository chunk ID.
  const chunkTexts = useMemo(() => chunks.map((c) => c.texto), [chunks]);
  const chunkIds = useMemo(() => chunks.map((c) => c.id), [chunks]);
  const chunkCapituloIds = useMemo(() => chunks.map((c) => c.capituloId), [chunks]);
  const totalChars = useMemo(
    () => chunkTexts.reduce((sum, text) => sum + text.length, 0),
    [chunkTexts],
  );

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
    chunkCapituloIds,
    activeChunkIndex: tts.activeChunkIndex,
    position: tts.currentPosition,
    chunkStartTimes: tts.chunkStartTimes,
    isPlaying: tts.isPlaying,
  });

  // When chunks load and TTS is idle, synthesize them.
  // Pass chunkTexts directly as preChunked so synthesis chunks = repository
  // chunks (1:1 mapping for progress). Pass bookId + chunkIds so the worker
  // can check the OPFS cache and skip synthesis for already-generated audio.
  const handleRead = () => {
    if (chunks.length === 0 || tts.status === "downloading-voice") return;
    tts.reset();

    // Find the resume chunk from saved progress.
    const saved = progressRef.current;
    let resumeFrom: { chunkIndex: number; offsetLocal: number } | undefined;
    if (saved && saved.chunkActualId) {
      const idx = chunkIds.indexOf(saved.chunkActualId);
      if (idx > 0 || (idx === 0 && (saved.offsetLocal ?? 0) > 0)) {
        resumeFrom = { chunkIndex: idx, offsetLocal: saved.offsetLocal ?? 0 };
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
      badge: ambient.isPlaying,
    },
    { label: "Programar descanso", icon: SleepIcon },
  ];

  if (loading) {
    return (
      <main className="bg-bg-tertiary flex min-h-screen min-h-[100dvh] min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="font-h2 text-text-secondary">Cargando documento…</p>
      </main>
    );
  }

  if (chunks.length === 0) {
    return (
      <main className="bg-bg-tertiary flex min-h-screen min-h-[100dvh] min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="font-h2 text-text-secondary">Este documento no tiene contenido para leer.</p>
      </main>
    );
  }

  // bookId is guaranteed to be a string once we reach the main render.
  const currentBookId = bookId as string;

  const format = bookFormat || "TXT";
  const voiceName = tts.voices.find((v) => v.id === tts.voiceId)?.label ?? "Voz";

  // Show saved progress until the resume seek has actually fired and real
  // playback has started. tts.duration grows as chunks are pushed (even before
  // the resume seek), and tts.currentPosition stays at 0 until the seek fires.
  // So we check currentPosition > 0 as the signal that real playback has started.
  // Without this, the karaoke would try word-level highlighting with partial
  // duration and no real chunkStartTimes — placing the highlight at the wrong word.
  const isIdle = tts.status === "idle" || tts.status === "error" || tts.status === "done";
  const savedPosition = progress?.offsetSegundos ?? 0;
  const showSaved = tts.currentPosition === 0 && savedPosition > 0;
  const displayPosition = showSaved ? savedPosition : tts.currentPosition;
  // Use indexOf (same as handleRead) instead of parsing the chunk ID string.
  // The string parser assumed IDs like "c0001" → 1, but that's fragile and
  // can be wrong if the ID format ever changes.
  const savedChunkIndex = progress ? Math.max(0, chunkIds.indexOf(progress.chunkActualId)) : 0;
  const displayChunkIndex = showSaved ? savedChunkIndex : tts.activeChunkIndex;
  const currentCapituloId = chunks[displayChunkIndex]?.capituloId ?? null;
  const chapterTitle = capitulos.find((c) => c.indice === currentCapituloId)?.titulo ?? "";

  // Scope the karaoke text to the chunks of the current chapter only, instead
  // of rendering the whole book — chunks are stored contiguously per chapter
  // (see LibraryPage), so the range is a simple slice. Playback itself is
  // unaffected: audio keeps streaming continuously across the whole book,
  // only the displayed text section changes as the chapter changes.
  const activeCapituloId = currentCapituloId ?? capitulos[0]?.indice ?? null;
  const chapterStart = chunks.findIndex((c) => c.capituloId === activeCapituloId);
  let chapterEnd = chapterStart;
  while (chapterEnd >= 0 && chunks[chapterEnd]?.capituloId === activeCapituloId) chapterEnd++;
  const [rangeStart, rangeEnd] =
    chapterStart >= 0 ? [chapterStart, chapterEnd] : [0, chunks.length];
  const chapterKaraokeChunks = karaokeChunks.slice(rangeStart, rangeEnd);
  // +1 so the last chunk of the chapter still knows the next chunk's start
  // time (for its estimated duration), even though that next chunk belongs
  // to the following chapter and isn't included in chapterKaraokeChunks.
  const chapterChunkStartTimes = tts.chunkStartTimes.slice(rangeStart, rangeEnd + 1);
  const chapterInitialChunkIndex =
    showSaved && savedChunkIndex >= rangeStart && savedChunkIndex < rangeEnd
      ? savedChunkIndex - rangeStart
      : -1;

  // When idle with no audio loaded, tts.duration is 0. We can't do word-level
  // highlighting without real timing data, so we pass initialChunkIndex to
  // highlight the saved chunk (sentence). Word-level highlighting kicks in
  // once audio is playing.
  // Note: tts.duration grows as chunks are pushed (even before playback starts),
  // so we can't use it to detect "audio is playing". Instead, we check
  // currentPosition > 0 — the position only advances when audio is actually
  // playing. While showSaved is true, pass duration=0 to KaraokeText so it
  // stays in chunk-level highlighting mode.
  const karaokeDuration = showSaved ? 0 : tts.duration;

  // Total duration and progress percentage for the playback bar. tts.duration
  // only counts audio chunks synthesized so far, so for a long document still
  // streaming in the background it's much smaller than the real total —
  // using it as the denominator makes the bar track "how much has been
  // synthesized" (which fills up fast at first, then stalls) instead of "how
  // far through the document". Extrapolate a total from the characters/second
  // rate observed in the chunks synthesized so far, and switch to the real
  // duration once every chunk has arrived.
  const isFullySynthesized = chunks.length > 0 && tts.chunksDone >= chunks.length;
  const charsSynthesized = chunkTexts
    .slice(0, tts.chunksDone)
    .reduce((sum, text) => sum + text.length, 0);
  const secondsPerChar = charsSynthesized > 0 ? tts.duration / charsSynthesized : 0;
  const estimatedTotalDuration = isFullySynthesized ? tts.duration : secondsPerChar * totalChars;
  const estimate = `Est. ${formatDuration(estimatedTotalDuration > 0 ? estimatedTotalDuration : totalChars / ESTIMATED_CHARS_PER_SEC)}`;

  const displayDuration = estimatedTotalDuration > 0 ? estimatedTotalDuration : tts.duration;
  const displayProgressPercent =
    estimatedTotalDuration > 0
      ? Math.min(100, (displayPosition / estimatedTotalDuration) * 100)
      : showSaved && chunks.length > 0
        ? (savedChunkIndex / chunks.length) * 100
        : 0;

  return (
    <main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-bg-tertiary">
      {/* Menú fijo, visible incluso cuando sube el panel de texto. */}
      <div className="fixed top-4 right-4 z-50">
        <BookMenu
          bookId={currentBookId}
          bookTitle={bookTitle}
          className={MENU_BUTTON}
          extraItems={menuItems}
          iconClassName="size-6"
          onDeleted={() => {
            tts.reset();
            navigate("/");
          }}
          onRenamed={setBookTitle}
        />
      </div>

      {/* Escenario: título + esfera detrás; el panel de texto sube y los tapa. */}
      <div className="relative min-h-0 md:min-h-[26rem] flex-1 overflow-hidden">
        <div className="absolute inset-0 flex flex-col p-4 pt-16 md:p-8 md:pt-8">
          <ReadingHeader title={bookTitle || "Documento"} format={format} estimate={estimate} />
          <div className="grid flex-1 place-items-center py-4">
            <VoiceSphere
              isPlaying={tts.isPlaying}
              loading={tts.status === "downloading-voice" || tts.status === "synthesizing"}
            />
          </div>
        </div>

        <div
          className="absolute z-10 inset-0 flex flex-col transition-transform duration-300 ease-out"
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
            <div className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col">
              <ReadingHeader
                activeChapter={currentCapituloId}
                chapter={chapterTitle}
                chapters={capitulos}
                estimate={estimate}
                format={format}
                onSelectChapter={(indice) => {
                  const chunkIndex = chunks.findIndex((c) => c.capituloId === indice);
                  if (chunkIndex >= 0) tts.seekToChunk(chunkIndex);
                }}
                showChapter={expanded}
                title={bookTitle || "Documento"}
              />

              <div className="min-h-0 flex-1 mt-4">
                <KaraokeText
                  chunkStartTimes={chapterChunkStartTimes}
                  chunks={chapterKaraokeChunks}
                  duration={karaokeDuration}
                  initialChunkIndex={chapterInitialChunkIndex}
                  initialOffsetLocal={showSaved ? (progress?.offsetLocal ?? 0) : 0}
                  secondsPerChar={secondsPerChar > 0 ? secondsPerChar : undefined}
                  onSeek={(localChunkIndex, localOffset) =>
                    tts.seekToChunk(rangeStart + localChunkIndex, localOffset)
                  }
                  position={displayPosition}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

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
        duration={formatDuration(displayDuration)}
        isPlaying={tts.status === "playing"}
        onForward={tts.forward}
        onOpenVoices={() => setPanel("voices")}
        onRewind={tts.rewind}
        onSpeedChange={tts.setSpeed}
        onToggle={() => {
          if (tts.status === "downloading-voice") return;
          if (isIdle) {
            handleRead();
          } else if (tts.status === "playing" || tts.status === "buffering") {
            tts.pause();
          } else if (tts.status === "paused") {
            tts.play();
          }
        }}
        onVolumeChange={tts.setVolume}
        position={formatDuration(displayPosition)}
        progressPercent={displayProgressPercent}
        speed={tts.speed}
        voiceId={tts.voiceId}
        voiceName={voiceName}
        volume={tts.volume}
      />

      <VoicesPanel
        downloadedIds={tts.downloadedVoiceIds}
        downloadingId={tts.downloadingVoiceId}
        onClose={() => setPanel(null)}
        onSelect={tts.downloadAndSetVoice}
        open={panel === "voices"}
        selectedId={tts.voiceId}
        voices={tts.voices}
      />
      <AudioPanel ambient={ambient} onClose={() => setPanel(null)} open={panel === "audio"} />
    </main>
  );
}
