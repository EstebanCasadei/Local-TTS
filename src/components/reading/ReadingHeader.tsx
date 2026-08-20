function truncateText(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
type ReadingHeaderProps = {
  title: string;
  format: string;
  estimate: string;
  chapter?: string;
  chapters?: { indice: number; titulo: string }[];
  activeChapter?: number | null;
  onSelectChapter?: (indice: number) => void;
  showChapter?: boolean;
};

export function ReadingHeader({
  title,
  format,
  estimate,
  chapter,
  chapters = [],
  activeChapter,
  onSelectChapter,
  showChapter = false,
}: ReadingHeaderProps) {
  return (
    <header className="text-center md:text-left border-b border-border-primary pb-4 z-10">
      <h1 className="font-h1 font-bold mb-2 truncate">{title}</h1>
      {showChapter ? (
        <div className="font-p mt-1 flex flex-col items-center gap-1 text-text-secondary md:flex-row md:items-center md:justify-between md:gap-2">
          <span>
            {format} • {estimate}
          </span>
          {chapter && (
            <label className="flex min-w-0 cursor-pointer items-center gap-1">
              <span className="font-medium text-text-primary">Capítulo:</span>
              {chapters.length > 1 ? (
                <select
                  aria-label="Capítulo"
                  className="max-w-[60vw] cursor-pointer truncate rounded-[8px] pr-1 text-text-secondary md:max-w-80"
                  onChange={(event) => onSelectChapter?.(Number(event.target.value))}
                  value={activeChapter ?? chapters[0]?.indice}
                >
                  {chapters.map((ch) => (
                    <option key={ch.indice} title={ch.titulo} value={ch.indice}>
                      {truncateText(ch.titulo)}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  aria-label="Capítulo"
                  className="max-w-[60vw] cursor-pointer truncate rounded-[8px] pr-1 text-text-secondary md:max-w-80"
                >
                  <option title={chapter}>{truncateText(chapter)}</option>
                </select>
              )}
            </label>
          )}
        </div>
      ) : (
        <p className="font-p mt-1 text-text-secondary flex justify-center text-cener">
          {format} • {estimate}
        </p>
      )}
    </header>
  );
}
