import type { KaraokeChunk } from "../../types/reading.ts";

type KaraokeTextProps = {
  chunks: KaraokeChunk[];
  activeIndex: number;
};

/** El chunk activo se resalta; lo ya leído queda atenuado. */
export function KaraokeText({ chunks, activeIndex }: KaraokeTextProps) {
  return (
    <p className="font-p leading-relaxed">
      {chunks.map((chunk, index) => (
        <span
          className={
            index === activeIndex
              ? "rounded-[4px] bg-action-primary/40 text-text-primary"
              : index < activeIndex
                ? "text-text-secondary"
                : "text-text-primary"
          }
          key={`chunk-${index}`}
        >
          {chunk.text}
        </span>
      ))}
    </p>
  );
}
