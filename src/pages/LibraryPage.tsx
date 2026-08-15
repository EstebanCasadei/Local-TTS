import { Aside } from "../components";

export function LibraryPage() {
  return (
    <div className="flex min-h-screen">
      <Aside />
      <main className="min-w-0 flex-1 p-4 pt-16 md:pt-4">
        <h1 className="font-h1 mb-4">Biblioteca</h1>
        <p className="font-p text-text-secondary">
          Aún no hay libros. Sube un EPUB o PDF para empezar.
        </p>
      </main>
    </div>
  );
}
