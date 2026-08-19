import { useRef, useState } from "react";
import { BookRow, ContinueCard, SearchIcon } from "../components/library";
import { useLibrary } from "../hooks/useLibrary.ts";
import { extractDocument, ACCEPT_ATTRIBUTE, type ExtractProgress } from "../lib/extract";
import { ERROR_MESSAGES, ExtractionError } from "../lib/extract/types";
import { chunkText } from "../lib/chunker";
import { getBookRepository } from "../lib/books";
import type { Book, Chunk } from "../types/book.ts";
import UploadIcon from "../icons/UploadIcon.svg?react";

type UploadState =
  | { status: "idle" }
  | { status: "extracting"; fileName: string; progress?: ExtractProgress }
  | { status: "error"; message: string };

export function LibraryPage() {
  const { books, loading } = useLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  // El repositorio ya ordena por fechaModificacion desc, así que el primero es el último escuchado.
  const [current, ...rest] = books;
  const filtered = rest.filter((book) =>
    book.titulo.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const [upload, setUpload] = useState<UploadState>({ status: "idle" });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUpload({ status: "extracting", fileName: file.name });

    try {
      // 1. Extract + clean the document text
      const doc = await extractDocument(file, {
        onProgress: (progress) =>
          setUpload({ status: "extracting", fileName: file.name, progress }),
      });

      // 2. Chunk each chapter separately so chunks know which chapter they belong to.
      const bookId = crypto.randomUUID();
      const now = Date.now();
      const chunks: Chunk[] = [];
      let chunkIndex = 0;
      for (const ch of doc.chapters) {
        for (const text of chunkText(ch.text)) {
          chunks.push({
            id: `c${String(chunkIndex).padStart(4, "0")}`,
            bookId,
            indiceOrden: chunkIndex,
            capituloId: ch.index,
            texto: text,
            voiceId: "es_ES-davefx-medium",
          });
          chunkIndex++;
        }
      }
      if (chunks.length === 0) {
        throw new ExtractionError("EMPTY_DOCUMENT" as never, file.name);
      }

      // 3. Create the Book + Chunk records in the repository
      const book: Book = {
        id: bookId,
        titulo: doc.title,
        autor: doc.meta.author ?? null,
        formatoOriginal: doc.kind,
        totalChunks: chunks.length,
        capitulos: doc.chapters.map((ch) => ({ indice: ch.index, titulo: ch.title })),
        fechaCreacion: now,
        fechaModificacion: now,
      };

      const repo = getBookRepository();
      await repo.saveBook(book);
      await repo.saveChunks(bookId, chunks);

      setUpload({ status: "idle" });
    } catch (err) {
      const message =
        err instanceof ExtractionError
          ? ERROR_MESSAGES[err.code]
          : err instanceof Error
            ? err.message
            : "Error desconocido";
      setUpload({ status: "error", message });
    }
  };

  return (
    <main className="bg-bg-primary flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden p-4 pt-16 md:p-8 md:pt-8">
      <input
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />

      <header className="flex flex-wrap items-start justify-center md:justify-between gap-4 border-b border-border-primary pb-4 w-full">
        <div>
          <h1 className="font-h1 font-bold text-center md:text-left">Biblioteca</h1>
          <p className="font-h2 text-center text-text-secondary md:text-left">
            Gestiona y escucha tus documentos guardados
          </p>
        </div>
        <button
          className="font-p flex cursor-pointer items-center gap-2 rounded-[8px] bg-action-primary px-4 py-2 font-bold text-text-primary transition duration-150 hover:bg-action-primary-hover active:scale-95"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          + Crear nuevo
        </button>
      </header>

      {!loading && books.length === 0 && (
        <section className="relative mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 py-16 text-center md:py-24">
          <h2 className="font-h2 font-bold">
            Convertí cualquier documento en audio para escuchar cuando quieras.
          </h2>

          <button
            className="flex w-full flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-border-primary bg-bg-secondary p-8 cursor-pointer transition duration-150 hover:bg-bg-tertiary active:scale-95"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <span className="grid size-14 place-items-center rounded-full bg-text-primary text-bg-primary">
              <UploadIcon className="size-8" />
            </span>
            <span className="font-p">Sube tu archivo</span>
            <span className="font-p text-text-secondary">Soporta PDF, EPUB, TXT (Max 50MB)</span>
          </button>

          <p className="font-h3 text-text-secondary">Subí tu primer documento para empezar</p>
        </section>
      )}

      {current && (
        <section className="mt-6 flex flex-col gap-3">
          <h2 className="font-h2 font-bold">Continúa escuchando</h2>
          <ContinueCard book={current} />
        </section>
      )}

      {upload.status === "extracting" && (
        <div className="mt-6 rounded-[8px] border border-border-primary bg-bg-secondary p-4 text-center">
          <p className="font-p text-text-secondary">
            Procesando "{upload.fileName}"…
            {upload.progress?.phase === "pages" &&
              ` Página ${upload.progress.done}/${upload.progress.total}`}
          </p>
        </div>
      )}

      {upload.status === "error" && (
        <div className="mt-6 rounded-[8px] border border-action-error bg-action-error/10 p-4 text-center">
          <p className="font-p text-action-error">{upload.message}</p>
          <button
            className="font-p mt-2 rounded-[8px] border border-action-error px-3 py-1 text-action-error"
            onClick={() => setUpload({ status: "idle" })}
            type="button"
          >
            Cerrar
          </button>
        </div>
      )}

      {rest.length > 0 && (
        <section className="mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-h2 font-bold">Documentos guardados</h2>
            <label className="font-p flex w-full items-center gap-2 rounded-[8px] bg-bg-secondary px-3 py-2 text-text-secondary border border-border-primary md:w-64">
              <SearchIcon />
              <input
                className="w-full bg-transparent text-text-primary outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar..."
                type="search"
                value={query}
              />
            </label>
          </div>

          <ul className="flex flex-col">
            {filtered.map((book) => (
              <BookRow book={book} key={book.id} />
            ))}
          </ul>

          {filtered.length === 0 && (
            <p className="font-p text-text-secondary">Ningún documento coincide con la búsqueda.</p>
          )}
        </section>
      )}
    </main>
  );
}
