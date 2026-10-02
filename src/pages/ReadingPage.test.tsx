import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingPage } from "./ReadingPage";

const { tts, bookData, repository, toast } = vi.hoisted(() => ({
  tts: {
    status: "done",
    voiceId: "es_ES-davefx-medium",
    voices: [{ id: "es_ES-davefx-medium", label: "Dave" }],
    speed: 1,
    volume: 1,
    currentPosition: 40,
    duration: 40,
    activeChunkIndex: 1,
    isPlaying: false,
    chunksDone: 2,
    synthesisChunks: ["Primer texto.", "Último texto."],
    chunkStartTimes: [0, 20],
    downloadedVoiceIds: [],
    play: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    synthesize: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    seekToChunk: vi.fn(),
    setSpeed: vi.fn(),
    setVolume: vi.fn(),
    downloadAndSetVoice: vi.fn(),
  },
  bookData: {
    loading: false,
    capitulos: [{ indice: 0, titulo: "Capítulo" }],
    chunks: [
      { id: "c0", texto: "Primer texto.", capituloId: 0 },
      { id: "c1", texto: "Último texto.", capituloId: 0 },
    ],
    progress: { chunkActualId: "c1", offsetSegundos: 40, offsetLocal: 20 },
  },
  repository: {
    getBook: vi.fn().mockResolvedValue({ titulo: "Libro", formatoOriginal: "txt" }),
    getBookmarks: vi.fn().mockResolvedValue([]),
  },
  toast: { show: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("../hooks/useTts.ts", () => ({ useTts: () => tts }));
vi.mock("../hooks/useBook.ts", () => ({ useBook: () => bookData }));
vi.mock("../hooks/useProgress.ts", () => ({ useProgress: vi.fn() }));
vi.mock("../hooks/useAmbientAudio.ts", () => ({
  useAmbientAudio: () => ({ isPlaying: false, pause: vi.fn() }),
}));
vi.mock("../lib/books", () => ({ getBookRepository: () => repository }));
vi.mock("../components", () => ({ useToast: () => toast, ToastProgress: () => null }));
vi.mock("../components/reading", async () => ({
  PlaybackControls: (await import("../components/reading/PlaybackControls")).PlaybackControls,
  AudioPanel: () => null,
  BookmarkNoteDialog: () => null,
  BookmarksPanel: () => null,
  KaraokeText: () => null,
  ReadingHeader: () => null,
  SleepTimerDialog: () => null,
  VoiceSphere: () => null,
  VoicesPanel: () => null,
}));

function renderReader() {
  return render(
    <MemoryRouter initialEntries={["/reading?book=book1"]}>
      <ReadingPage />
    </MemoryRouter>,
  );
}

describe("ReadingPage completion controls", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    tts.status = "done";
    tts.currentPosition = 40;
  });

  it("uses replay instead of re-synthesizing from saved end-of-book progress", () => {
    renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Reproducir" }));
    expect(tts.play).toHaveBeenCalledOnce();
    expect(tts.reset).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("keeps rewind and forward connected after completion", () => {
    renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Retroceder 15 segundos" }));
    fireEvent.click(screen.getByRole("button", { name: "Adelantar 15 segundos" }));
    expect(tts.rewind).toHaveBeenCalledOnce();
    expect(tts.forward).toHaveBeenCalledOnce();
  });

  it("shows zero on replay rather than the previously saved final position", () => {
    tts.status = "playing";
    tts.currentPosition = 0;
    renderReader();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("still resumes saved progress when starting with no loaded audio", () => {
    tts.status = "idle";
    renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Reproducir" }));
    expect(tts.synthesize).toHaveBeenCalledWith(
      "Primer texto.\nÚltimo texto.",
      "book1",
      ["c0", "c1"],
      ["Primer texto.", "Último texto."],
      { chunkIndex: 1, offsetLocal: 20 },
    );
  });
});
