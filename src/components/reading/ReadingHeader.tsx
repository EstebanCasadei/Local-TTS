type ReadingHeaderProps = {
  title: string;
  format: string;
  estimate: string;
  chapter?: string;
  showChapter?: boolean;
};

export function ReadingHeader({
  title,
  format,
  estimate,
  chapter,
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
            <label className="flex cursor-pointer items-center gap-1">
              <span className="font-medium text-text-primary">Capítulo:</span>
              <select
                aria-label="Capítulo"
                className="cursor-pointer rounded-[8px] pr-1 text-text-secondary"
              >
                <option>{chapter}</option>
              </select>
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
