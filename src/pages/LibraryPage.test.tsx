import { captureException } from "@sentry/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { extractDocument } from "../lib/extract";
import { ErrorCode, ExtractionError } from "../lib/extract/types";
import type { Book } from "../types/book.ts";
import { LibraryPage } from "./LibraryPage.tsx";

const book = (id: string, titulo: string): Book => ({
  id,
  titulo,
  autor: null,
  formatoOriginal: "pdf",
  totalChunks: 10,
  capitulos: [],
  fechaCreacion: Date.UTC(2025, 9, 12),
  fechaModificacion: Date.UTC(2025, 9, 12),
});

const books = [
  book("1", "Q3 Market Analysis"),
  book("2", "Annual Financial Report"),
  book("3", "Machine Learning Ethics"),
];

vi.mock("../hooks/useLibrary.ts", () => ({
  useLibrary: () => ({ books, loading: false }),
}));

vi.mock("../hooks/useBookProgress.ts", () => ({
  useBookProgress: () => ({ progress: null, loading: false }),
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

vi.mock("../lib/extract", () => ({
  ACCEPT_ATTRIBUTE: ".txt,.md,.pdf,.epub,text/plain,application/pdf,application/epub+zip",
  extractDocument: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

describe("LibraryPage", () => {
  it("shows the most recent book in 'Continúa escuchando' and the rest in the list", () => {
    renderPage();
    expect(screen.getByText("Q3 Market Analysis")).toBeInTheDocument();
    expect(screen.getByText("Annual Financial Report")).toBeInTheDocument();
    expect(screen.queryByText("Sube tu archivo")).not.toBeInTheDocument();
  });

  it("filters the saved list by title, leaving the current book untouched", () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Buscar..."), {
      target: { value: "machine" },
    });

    expect(screen.getByText("Machine Learning Ethics")).toBeInTheDocument();
    expect(screen.queryByText("Annual Financial Report")).not.toBeInTheDocument();
    expect(screen.getByText("Q3 Market Analysis")).toBeInTheDocument();
  });

  it("reports upload errors to Sentry with the error code and file context", async () => {
    const error = new ExtractionError(ErrorCode.PARSE_ERROR, "doc.pdf");
    vi.mocked(extractDocument).mockRejectedValue(error);

    const { container } = renderPage();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([""], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText(/Error al procesar el documento/)).toBeInTheDocument();
    expect(vi.mocked(captureException)).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { error_code: ErrorCode.PARSE_ERROR },
        extra: expect.objectContaining({
          fileName: "doc.pdf",
          fileType: "application/pdf",
        }),
      }),
    );
  });
});
