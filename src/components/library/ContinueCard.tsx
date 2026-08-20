import { Link } from "react-router";
import type { Book } from "../../types/book.ts";
import { useBookProgress } from "../../hooks/useBookProgress.ts";
import { formatDuration } from "../../lib/audio.ts";
import { BookMenu } from "./BookMenu.tsx";
import { BookMeta, PlayIcon, SyncBadge } from "./shared.tsx";

export function ContinueCard({ book }: { book: Book }) {
  const { progress } = useBookProgress(book.id);

  // Estimate progress as chunk index / total chunks — we don't have audio
  // duration in the book metadata, so this is the best we can do without
  // playing. It's accurate enough for a progress bar.
  const chunkIndex = progress
    ? Math.max(0, parseInt(progress.chunkActualId.replace(/^c/, ""), 10) || 0)
    : 0;
  const percent = book.totalChunks > 0 ? Math.round((chunkIndex / book.totalChunks) * 100) : 0;

  return (
    <article className="flex flex-col gap-4 rounded-[16px] bg-bg-secondary border border-border-primary p-4 md:p-6">
      <div className="flex items-start justify-between gap-2">
        <Link
          className="min-w-0 transition duration-150 hover:text-text-primary-hover"
          to={`/reading?book=${book.id}`}
        >
          <h3 className="font-h3 font-semibold truncate">{book.titulo}</h3>
          <BookMeta book={book} progress={progress} />
        </Link>
        <BookMenu />
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-label flex justify-between text-text-primary">
          <span>{percent}% completado</span>
          <span>
            {progress ? `Última vez: ${formatDuration(progress.offsetSegundos)}` : "00:00 / 00:00"}
          </span>
        </div>
        <div
          aria-label="Progreso de escucha"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-text-primary"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-action-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          className="font-p flex w-fit items-center gap-2 rounded-[8px] bg-text-primary px-4 py-2 font-bold text-bg-primary transition duration-150 hover:bg-text-primary-hover active:scale-95"
          to={`/reading?book=${book.id}`}
        >
          <PlayIcon />
          {progress ? "Continuar" : "Reproducir"}
        </Link>

        <SyncBadge sync="local" />
      </div>
    </article>
  );
}
