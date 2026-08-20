import { useMemo } from "react";

type WordToken = {
  text: string;
  isSpace: boolean;
  chunkIndex: number;
  start: number;
  end: number;
  /**
   * Offset within the chunk (not the absolute timeline). Computed directly
   * from the word's position in the chunk, independent of `start` — `start`
   * is offset from `chunkStart`, which is Number.MAX_SAFE_INTEGER for chunks
   * with no known real start time yet. Subtracting a fallback like 0 from
   * that `start` to recover a local offset would produce a huge bogus value.
   */
  localOffset: number;
};

type KaraokeTextProps = {
  chunks: string[];
  chunkStartTimes: (number | undefined)[];
  position: number;
  duration: number;
  /**
   * Called with the clicked word's chunk index (local to `chunks`) and its
   * offset within that chunk — NOT an absolute time. PlaybackQueue.seek(time)
   * assumes every chunk from 0 up to the target is already buffered
   * contiguously, which no longer holds once chunks can synthesize
   * out of order (chapter jumps prioritize a chunk ahead of earlier ones).
   * seekToChunk(index, offset) works regardless of synthesis order.
   */
  onSeek?: (chunkIndex: number, localOffset: number) => void;
  /** Chunk to highlight before audio loads (from saved progress). -1 = none. */
  initialChunkIndex?: number;
  /** Offset within the saved chunk for word-level highlight before audio loads. */
  initialOffsetLocal?: number;
  /** Estimated seconds per character from real synthesized audio, used to
   * size chunks whose next real start isn't known yet. Falls back to a
   * hardcoded rate if no audio has finished. */
  secondsPerChar?: number;
};

const WORD_CLASS = "cursor-pointer rounded-[2px] transition-colors duration-100";
const ACTIVE_WORD_CLASS = "rounded-[4px] bg-action-primary/40 text-text-primary";
const ACTIVE_CHUNK_CLASS = "bg-action-primary/10 text-text-primary";
const PAST_CLASS = "text-text-secondary";
const FUTURE_CLASS = "text-text-primary";

/** Rough Piper Spanish synthesis rate, used to estimate a chunk's spoken
 * duration when its real one isn't known yet (see buildTokens). */
const ESTIMATED_CHARS_PER_SEC = 15;

/** Splits text into words and whitespace tokens. */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/);
}

/** Builds a flat list of word/space tokens with per-chunk timing estimates. */
function buildTokens(
  chunks: string[],
  chunkStartTimes: (number | undefined)[],
  secondsPerChar = 1 / ESTIMATED_CHARS_PER_SEC,
): WordToken[] {
  const tokens: WordToken[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const raw = splitWords(chunk);
    const words = raw.filter((t) => !/^\s+$/.test(t));
    const chunkChars = words.reduce((s, w) => s + w.length, 0);

    const nextStart = chunkStartTimes[i + 1];

    // When we have real timing data, use it. When we don't, push the chunk
    // far into the future so its words can never be matched by a real
    // playback position — they'll appear as "future" words with no timing.
    // This prevents the fallback from placing unstarted chunks at wrong
    // positions that interfere with the active word lookup.
    const chunkStart = chunkStartTimes[i] ?? Number.MAX_SAFE_INTEGER;
    // When the next chunk's real start isn't known yet, estimate this
    // chunk's own duration from its text length instead of falling back to
    // the book's total synthesized duration so far. That total grows from
    // chunks synthesized anywhere in the book (chapter jumps prioritize
    // far-away chunks out of order), so it has no relation to how long THIS
    // one chunk actually takes — using it stretched word timings far beyond
    // the chunk's real audio, freezing the highlight mid-word.
    const chunkDuration = nextStart != null ? nextStart - chunkStart : chunkChars * secondsPerChar;

    let localCharOffset = 0;
    for (const tokenText of raw) {
      if (/^\s+$/.test(tokenText)) {
        tokens.push({
          text: tokenText,
          isSpace: true,
          chunkIndex: i,
          start: 0,
          end: 0,
          localOffset: 0,
        });
        continue;
      }

      const wordLocalOffset = chunkChars > 0 ? (localCharOffset / chunkChars) * chunkDuration : 0;
      const start = chunkStart + wordLocalOffset;
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
        localOffset: wordLocalOffset,
      });

      localCharOffset += tokenText.length;
    }

    if (i < chunks.length - 1) {
      tokens.push({
        text: "\n",
        isSpace: true,
        chunkIndex: -1,
        start: 0,
        end: 0,
        localOffset: 0,
      });
    }
  }

  return tokens;
}

/** Returns the index of the word currently at `position`, or -1. */
function findActiveWordIndex(tokens: WordToken[], position: number, duration: number): number {
  if (duration <= 0) return -1;

  // Return the LAST word whose range contains position, not the first. When
  // chunk timings overlap due to stale or out-of-order chunkStartTimes, the
  // first matching word can be from an earlier chunk whose end has been
  // stretched far into the future; the last matching word is the one most
  // likely to correspond to the actual audio at this moment.
  let match = -1;
  let lastWordIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.isSpace) continue;
    lastWordIndex = i;
    if (position >= token.start && position < token.end) {
      match = i;
    }
  }

  // If we've passed the end of all words, highlight the last one.
  if (match < 0 && position >= duration && lastWordIndex >= 0) {
    return lastWordIndex;
  }

  return match;
}

/**
 * Karaoke text: renders the audio chunks as clickable word spans and
 * highlights the active chunk and active word.
 * Clicking a word seeks playback to that word's estimated start time.
 */
export function KaraokeText({
  chunks,
  chunkStartTimes,
  position,
  duration,
  onSeek,
  initialChunkIndex = -1,
  initialOffsetLocal = 0,
  secondsPerChar,
}: KaraokeTextProps) {
  const tokens = useMemo(
    () => buildTokens(chunks, chunkStartTimes, secondsPerChar),
    [chunks, chunkStartTimes, secondsPerChar],
  );

  // Before audio loads (duration <= 0), estimate word-level highlighting
  // within the saved chunk using initialOffsetLocal. We estimate the chunk's
  // duration from its text length so buildTokens can distribute word timings
  // proportionally.
  const initialChunkDuration =
    initialChunkIndex >= 0 && chunks[initialChunkIndex]
      ? chunks[initialChunkIndex].length / ESTIMATED_CHARS_PER_SEC
      : 0;

  const activeIndex = useMemo(() => {
    if (duration > 0) {
      return findActiveWordIndex(tokens, position, duration);
    }

    // Before audio: find the active word within the saved chunk using
    // the estimated chunk duration and initialOffsetLocal.
    if (initialChunkIndex < 0 || initialChunkDuration <= 0) return -1;

    // Build a mini timeline for just the saved chunk's words.
    const chunkTokens = tokens.filter((t) => !t.isSpace && t.chunkIndex === initialChunkIndex);
    const chunkChars = chunkTokens.reduce((s, t) => s + t.text.length, 0);
    if (chunkChars === 0) return -1;

    let charOffset = 0;
    for (const token of chunkTokens) {
      const wordStart = (charOffset / chunkChars) * initialChunkDuration;
      const wordEnd = ((charOffset + token.text.length) / chunkChars) * initialChunkDuration;
      if (initialOffsetLocal >= wordStart && initialOffsetLocal < wordEnd) {
        return tokens.indexOf(token);
      }
      charOffset += token.text.length;
    }
    return -1;
  }, [tokens, position, duration, initialChunkIndex, initialChunkDuration, initialOffsetLocal]);

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

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
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

          const handleClick = (
            _event: React.MouseEvent<HTMLSpanElement> | React.KeyboardEvent<HTMLSpanElement>,
          ) => {
            onSeek?.(token.chunkIndex, token.localOffset);
          };

          return (
            <span
              className={className}
              key={index}
              onClick={handleClick}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleClick(event);
                }
              }}
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
