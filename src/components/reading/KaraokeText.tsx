import type { KaraokeChunk } from "../../types/reading.ts";

type KaraokeTextProps = {
  chunks: KaraokeChunk[];
  activeIndex: number;
};

export function KaraokeText({ chunks, activeIndex }: KaraokeTextProps) {
  return (
    <p className="space-x-1 leading-relaxed">
      {chunks.map((chunk, index) => (
        <span
          key={`chunk-${index}`}
          className={index === activeIndex ? "bg-yellow-200 text-gray-900" : "text-gray-700"}
        >
          {chunk.text}
        </span>
      ))}
    </p>
  );
}
