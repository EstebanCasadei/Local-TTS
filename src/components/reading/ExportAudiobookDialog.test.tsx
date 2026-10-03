import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportAudiobookDialog } from "./ExportAudiobookDialog";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), run: vi.fn(), dispose: vi.fn() }));
vi.mock("../../lib/exportClient", () => ({
  ExportClient: class {
    inspect = mocks.inspect;
    run = mocks.run;
    dispose = mocks.dispose;
  },
}));
const book = { bookId: "book", voiceId: "voice", chunks: ["Uno", "Dos"], chunkIds: ["c0", "c1"] };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("audiobook export consent and completion", () => {
  it("explains resource use before starting, pauses reading, and enables download only on completion", async () => {
    mocks.inspect.mockResolvedValue({
      seconds: 3600,
      bytes: 28800000,
      cached: 1,
      total: 2,
      exactDuration: false,
      freeBytes: 100000000,
    });
    let finish!: (file: File) => void;
    mocks.run.mockImplementation(
      () =>
        new Promise<File>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:complete"),
      revokeObjectURL: vi.fn(),
    });
    const pause = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <ExportAudiobookDialog
        open
        book={book}
        title="Libro"
        voiceName="Davefx"
        voiceSize="63 MB"
        onPause={pause}
        onClose={() => {}}
      />,
    );
    await screen.findByRole("button", { name: "Preparar MP3" });
    expect(screen.getByText(/28,8 MB por hora/)).toBeInTheDocument();
    expect(screen.getByText(/CPU y batería/)).toBeInTheDocument();
    expect(mocks.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar MP3" }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
    expect(pause).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Descargar MP3" })).toBeNull();
    await act(async () => finish(new File(["mp3"], "export.mp3")));
    expect(screen.getByRole("link", { name: "Descargar MP3" })).toHaveAttribute(
      "download",
      "Libro.mp3",
    );
    view.unmount();
    expect(mocks.dispose).toHaveBeenCalled();
  });

  it("blocks export when estimated storage is insufficient", async () => {
    mocks.inspect.mockResolvedValue({
      seconds: 3600,
      bytes: 28800000,
      cached: 0,
      total: 2,
      exactDuration: false,
      freeBytes: 1,
    });
    render(
      <ExportAudiobookDialog
        open
        book={book}
        title="Libro"
        voiceName="Davefx"
        voiceSize="63 MB"
        onPause={vi.fn()}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByRole("button", { name: "Preparar MP3" })).toBeDisabled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
