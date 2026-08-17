import { Link } from "react-router";
import type { Book } from "../../types/book.ts";
import { BookMenu } from "./BookMenu.tsx";
import { BookMeta, PlayIcon, SyncBadge } from "./shared.tsx";

// ponytail: progreso maquetado con valores fijos — `Progress` no guarda
// duración y el audio es #6. Conectar cuando exista.
const PLACEHOLDER = { percent: 45, elapsed: "12:45", total: "28:30" };

export function ContinueCard({ book }: { book: Book }) {
  return (
    <article className="flex flex-col gap-4 rounded-[16px] bg-bg-secondary border border-border-primary p-4 md:p-6">
      <div className="flex items-start justify-between gap-2">
        <Link
          className="min-w-0 transition duration-150 hover:text-text-primary-hover"
          to="/reading"
        >
          <h3 className="font-h3 font-semibold">{book.titulo}</h3>
          <BookMeta book={book} />
        </Link>
        <BookMenu />
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-label flex justify-between text-text-primary">
          <span>{PLACEHOLDER.percent}% completado</span>
          <span>
            {PLACEHOLDER.elapsed} / {PLACEHOLDER.total}
          </span>
        </div>
        <div
          aria-label="Progreso de escucha"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={PLACEHOLDER.percent}
          className="h-1.5 overflow-hidden rounded-full bg-text-primary"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-action-primary"
            style={{ width: `${PLACEHOLDER.percent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          className="font-p flex w-fit items-center gap-2 rounded-[8px] bg-text-primary px-4 py-2 font-bold text-bg-primary transition duration-150 hover:bg-text-primary-hover active:scale-95"
          to="/reading"
        >
          <PlayIcon />
          Reproducir
        </Link>

        <SyncBadge sync="local" />
      </div>
    </article>
  );
}
