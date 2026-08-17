import type { SVGProps } from "react";
import DotsIconSvg from "../../icons/DotsIcon.svg?react";
import PlayIconSvg from "../../icons/PlayIcon.svg?react";
import SearchIconSvg from "../../icons/SearchIcon.svg?react";
import type { Book } from "../../types/book.ts";

const LONG_DATE = new Intl.DateTimeFormat("es", { dateStyle: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("es", { dateStyle: "short" });

/** "Creado el 12 de octubre de 2025 · PDF" on md+, "12/10/25 · PDF" below. */
export function BookMeta({ book }: { book: Book }) {
  const format = book.formatoOriginal.toUpperCase();
  return (
    <p className="font-label truncate text-text-secondary">
      <span className="md:hidden">{SHORT_DATE.format(book.fechaCreacion)}</span>
      <span className="hidden md:inline">Creado el {LONG_DATE.format(book.fechaCreacion)}</span>
      {" • "}
      {format}
    </p>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return <PlayIconSvg className="size-5" {...props} />;
}

export function DotsIcon({ className = "size-5" }: { className?: string }) {
  return <DotsIconSvg className={className} />;
}

// ponytail: placeholder badges hasta que Book tenga un campo de sync.
// Los colores y "En la nube" son visuales, no ligados a datos reales.
export function SyncBadge({ sync }: { sync: "cloud" | "local" }) {
  const cloud = sync === "cloud";
  return (
    <span className="font-label inline-flex items-center gap-1.5 rounded-[8px] border border-border-primary bg-bg-tertiary px-2 py-1 text-text-primary">
      {cloud ? "En la nube" : "Local"}
    </span>
  );
}

export function SearchIcon() {
  return <SearchIconSvg className="size-5 shrink-0 text-text-primary" />;
}
