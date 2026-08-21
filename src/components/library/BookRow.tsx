import { Link } from "react-router";
import type { Book } from "../../types/book.ts";
import { useBookProgress } from "../../hooks/useBookProgress.ts";
import { BookMenu } from "./BookMenu.tsx";
import { BookMeta, PlayIcon, SyncBadge } from "./shared.tsx";

// ponytail: placeholder — asigna un badge cloud al libro con id terminado en "2"
// para mostrar ambos estados. Reemplazar por datos reales cuando existan.
function placeholderSyncFor(book: Book): "cloud" | "local" {
  return book.id.endsWith("2") ? "cloud" : "local";
}

export function BookRow({ book }: { book: Book }) {
  const { progress } = useBookProgress(book.id);
  return (
    <li className="flex items-center gap-3 border-b border-border-primary py-3 last:border-b-0">
      <Link
        aria-label={`Reproducir ${book.titulo}`}
        className="hidden size-9 shrink-0 place-items-center rounded-[8px] bg-text-primary text-bg-primary transition duration-150 hover:bg-text-primary-hover active:scale-95 md:grid"
        to={`/reading?book=${book.id}`}
      >
        <PlayIcon />
      </Link>

      <Link
        className="min-w-0 flex-1 transition duration-150 hover:text-text-primary-hover"
        to={`/reading?book=${book.id}`}
      >
        <p className="font-p truncate">{book.titulo}</p>
        <BookMeta book={book} progress={progress} />
      </Link>

      <div className="flex items-center gap-2">
        <SyncBadge sync={placeholderSyncFor(book)} />
        <BookMenu bookId={book.id} bookTitle={book.titulo} />
      </div>
    </li>
  );
}
