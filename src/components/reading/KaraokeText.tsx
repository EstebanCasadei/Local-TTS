import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordToken = {
  text: string;
  isSpace: boolean;
  chunkIndex: number;
  start: number;
  end: number;
};

type KaraokeTextProps = {
  chunks: string[];
  chunkStartTimes: (number | undefined)[];
  position: number;
  duration: number;
  onSeek?: (time: number) => void;
  /** Chunk to highlight before audio loads (from saved progress). -1 = none. */
  initialChunkIndex?: number;
};

const WORD_CLASS = "cursor-default rounded-[2px] transition-colors duration-100";
const ACTIVE_WORD_CLASS = "rounded-[4px] bg-action-primary/40 text-text-primary";
const ACTIVE_CHUNK_CLASS = "bg-action-primary/10 text-text-primary";
const PAST_CLASS = "text-text-secondary";
const FUTURE_CLASS = "text-text-primary";

const SCROLL_PAUSE_MS = 3000;

/** Splits text into words and whitespace tokens. */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/);
}

/** Builds a flat list of word/space tokens with per-chunk timing estimates. */
function buildTokens(
  chunks: string[],
  chunkStartTimes: (number | undefined)[],
  duration: number,
): WordToken[] {
  const totalChars = Math.max(
    1,
    chunks.reduce(
      (sum, chunk) =>
        sum +
        splitWords(chunk)
          .filter((t) => !/^\s+$/.test(t))
          .reduce((s, w) => s + w.length, 0),
      0,
    ),
  );

  const tokens: WordToken[] = [];
  let globalCharOffset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const raw = splitWords(chunk);
    const words = raw.filter((t) => !/^\s+$/.test(t));
    const chunkChars = words.reduce((s, w) => s + w.length, 0);

    const fallbackStart = (globalCharOffset / totalChars) * duration;
    const fallbackDuration = (chunkChars / totalChars) * duration;

    const hasRealStart = chunkStartTimes[i] != null;
    const chunkStart = chunkStartTimes[i] ?? fallbackStart;
    const nextStart = chunkStartTimes[i + 1];

    // When we have real timing data, the last known chunk gets the remaining
    // duration (duration - chunkStart). But when chunkStart is itself a
    // fallback (no real data), use the proportional fallbackDuration —
    // otherwise the first chunk hogs the entire timeline and every word in
    // it spans a huge range, so only the first word gets highlighted.
    const chunkDuration =
      nextStart != null
        ? nextStart - chunkStart
        : hasRealStart
          ? duration > chunkStart
            ? duration - chunkStart
            : fallbackDuration
          : fallbackDuration;

    let localCharOffset = 0;
    for (const tokenText of raw) {
      if (/^\s+$/.test(tokenText)) {
        tokens.push({
          text: tokenText,
          isSpace: true,
          chunkIndex: i,
          start: 0,
          end: 0,
        });
        continue;
      }

      const start =
        chunkChars > 0 ? chunkStart + (localCharOffset / chunkChars) * chunkDuration : chunkStart;
      const end =
        chunkChars > 0
          ? chunkStart + ((localCharOffset + tokenText.length) / chunkChars) * chunkDuration
          : start;

      tokens.push({
        text: tokenText,
        isSpace: false,
        chunkIndex: i,
        start,
        end,
      });

      localCharOffset += tokenText.length;
    }

    globalCharOffset += chunkChars;

    if (i < chunks.length - 1) {
      tokens.push({
        text: "\n",
        isSpace: true,
        chunkIndex: -1,
        start: 0,
        end: 0,
      });
    }
  }

  return tokens;
}

/** Returns the index of the word currently at `position`, or -1. */
function findActiveWordIndex(tokens: WordToken[], position: number, duration: number): number {
  if (duration <= 0) return -1;

  let lastWordIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.isSpace) continue;
    lastWordIndex = i;
    if (position >= token.start && position < token.end) {
      return i;
    }
  }

  // If we've passed the end of all words, highlight the last one.
  if (position >= duration && lastWordIndex >= 0) {
    return lastWordIndex;
  }

  return -1;
}

/**
 * Karaoke text: renders the audio chunks as clickable word spans, highlights
 * the active chunk and active word, and auto-scrolls to the active word.
 * Clicking a word seeks playback to that word's estimated start time.
 */
export function KaraokeText({
  chunks,
  chunkStartTimes,
  position,
  duration,
  onSeek,
  initialChunkIndex = -1,
}: KaraokeTextProps) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const chunkRef = useRef<HTMLSpanElement | null>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  const autoScrollRef = useRef(false);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokens = useMemo(
    () => buildTokens(chunks, chunkStartTimes, duration),
    [chunks, chunkStartTimes, duration],
  );

  const activeIndex = useMemo(
    () => findActiveWordIndex(tokens, position, duration),
    [tokens, position, duration],
  );

  // Before audio loads (duration <= 0), use initialChunkIndex from saved
  // progress. Once audio is playing (duration > 0), use real word timing.
  const activeChunkIndex = useMemo(() => {
    if (duration <= 0) return initialChunkIndex;
    if (activeIndex >= 0) return tokens[activeIndex]?.chunkIndex ?? -1;

    for (const token of tokens) {
      if (!token.isSpace && token.start > position) {
        return token.chunkIndex;
      }
    }

    return chunks.length > 0 ? chunks.length - 1 : -1;
  }, [activeIndex, chunks.length, duration, initialChunkIndex, position, tokens]);

  // Auto-scroll: to the active word when playing, or to the saved chunk when idle.
  useEffect(() => {
    if (scrollPaused) return;

    const targetRef = activeRef.current ?? chunkRef.current;
    if (!targetRef) return;

    autoScrollRef.current = true;
    if (typeof targetRef.scrollIntoView === "function") {
      targetRef.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }

    const t = setTimeout(() => {
      autoScrollRef.current = false;
    }, 500);
    return () => clearTimeout(t);
  }, [activeIndex, activeChunkIndex, scrollPaused, tokens]);

  const handleScroll = useCallback(() => {
    if (autoScrollRef.current) return;

    setScrollPaused(true);
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      setScrollPaused(false);
    }, SCROLL_PAUSE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, []);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto" onScroll={handleScroll}>
      <p className="font-p whitespace-pre-line leading-relaxed">
        {tokens.map((token, index) => {
          if (token.isSpace) {
            return <span key={index}>{token.text}</span>;
          }

          const isActive = index === activeIndex;
          const isPast =
            !token.isSpace &&
            ((duration > 0 && token.end <= position) ||
              (duration <= 0 && token.chunkIndex < activeChunkIndex));
          const isActiveChunk = token.chunkIndex === activeChunkIndex && !isPast;
          // Attach chunkRef to the first word of the active chunk so we can
          // scroll to it before audio loads (when there's no active word).
          const isFirstWordOfChunk =
            isActiveChunk &&
            !isActive &&
            !tokens.slice(0, index).some((t) => t.chunkIndex === token.chunkIndex && !t.isSpace);

          let className = WORD_CLASS;
          if (isActive) {
            className += ` ${ACTIVE_WORD_CLASS}`;
          } else if (isPast) {
            className += ` ${PAST_CLASS}`;
          } else if (isActiveChunk) {
            className += ` ${ACTIVE_CHUNK_CLASS}`;
          } else {
            className += ` ${FUTURE_CLASS}`;
          }

          const handleClick = () => {
            onSeek?.(token.start);
          };

          return (
            <span
              className={className}
              key={index}
              onClick={handleClick}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleClick();
                }
              }}
              ref={isActive ? activeRef : isFirstWordOfChunk ? chunkRef : undefined}
              role="button"
              tabIndex={0}
              title="Reproducir desde esta palabra"
            >
              {token.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}
