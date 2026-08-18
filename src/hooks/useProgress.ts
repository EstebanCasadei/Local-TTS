import { useEffect, useRef } from "react";
import { getBookRepository } from "../lib/books";
import type { Progress } from "../types/book.ts";

const SAVE_INTERVAL_MS = 5000; // debounce: save at most every 5 seconds

/**
 * Debounced progress saving. Watches the TTS playback position and saves a
 * Progress record to the repository periodically during playback, on pause,
 * and on unmount. The repository facade handles local vs. synced storage —
 * this hook doesn't know or care where data lives.
 *
 * chunkIds must align 1:1 with the synthesis chunks (useTts.synthesisChunks),
 * so that activeChunkIndex maps directly to a repository chunk ID.
 */
export function useProgress(params: {
  bookId: string | null;
  chunkIds: string[];
  activeChunkIndex: number;
  position: number;
  chunkStartTimes: (number | undefined)[];
  isPlaying: boolean;
  duration: number;
}): void {
  const { bookId, chunkIds, activeChunkIndex, position, chunkStartTimes, isPlaying, duration } =
    params;

  // Refs so the interval callback always sees the latest values without
  // resetting the timer on every position change (which fires ~10×/sec).
  const positionRef = useRef(position);
  const activeChunkIndexRef = useRef(activeChunkIndex);
  const chunkStartTimesRef = useRef(chunkStartTimes);
  const isPlayingRef = useRef(isPlaying);
  const durationRef = useRef(duration);

  positionRef.current = position;
  activeChunkIndexRef.current = activeChunkIndex;
  chunkStartTimesRef.current = chunkStartTimes;
  isPlayingRef.current = isPlaying;
  durationRef.current = duration;

  const saveNow = useRef<(() => void) | null>(null);

  // Build the save function from current refs.
  saveNow.current = () => {
    if (!bookId || chunkIds.length === 0) return;

    const idx = activeChunkIndexRef.current;
    const chunkId = chunkIds[idx];
    if (!chunkId) return;

    // Offset within the current chunk = global position - chunk start time.
    const chunkStart = chunkStartTimesRef.current[idx] ?? 0;
    const offset = Math.max(0, positionRef.current - chunkStart);

    const progress: Progress = {
      bookId,
      chunkActualId: chunkId,
      offsetSegundos: offset,
      fechaUltimaEscucha: Date.now(),
    };

    void getBookRepository().saveProgress(progress);
  };

  // Periodic save during playback.
  useEffect(() => {
    if (!bookId) return;

    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        saveNow.current?.();
      }
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [bookId]);

  // Save on pause.
  useEffect(() => {
    if (!isPlaying && bookId && position > 0) {
      saveNow.current?.();
    }
  }, [isPlaying, bookId, position]);

  // Save on unmount.
  useEffect(() => {
    return () => {
      saveNow.current?.();
    };
  }, [bookId]);
}
