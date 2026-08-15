import { useRef } from "react";
import { useLibrary } from "../hooks/useLibrary.ts";

const ACCEPT = ".pdf,.epub,.txt";

export function LibraryPage() {
  const { books, loading } = useLibrary();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    // TODO(#7/#8/#9): extract + chunk the document once lib/extract lands.
    if (file) console.log("archivo seleccionado", file.name);
  };

  return (
    <main className="bg-bg-primary flex min-h-screen min-w-0 flex-1 flex-col p-4 pt-16 md:p-8 md:pt-8">
      <input
        accept={ACCEPT}
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
      </header>

      {!loading && books.length === 0 && (
        <section className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 py-16 text-center md:py-24">
          <h2 className="font-h2 font-bold">
            Convertí cualquier documento en audio para escuchar cuando quieras.
          </h2>

          <button
            className="flex w-full flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-border-primary bg-bg-secondary p-8 hover:bg-bg-secondary/80 cursor-pointer"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <span className="grid size-14 place-items-center rounded-full bg-text-primary text-bg-primary">
              <UploadIcon />
            </span>
            <span className="font-p">Sube tu archivo</span>
            <span className="font-p text-text-secondary">Soporta PDF, EPUB, TXT (Max 50MB)</span>
          </button>

          <p className="font-h3 text-text-secondary">Subí tu primer documento para empezar</p>
        </section>
      )}

      {/* no hay diseño para la grilla con libros todavía. */}
      {books.length > 0 && (
        <ul className="mt-8 flex flex-col gap-2">
          {books.map((book) => (
            <li className="font-p rounded-[8px] bg-bg-secondary p-4" key={book.id}>
              {book.titulo}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function UploadIcon() {
  return (
    <svg className="size-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
