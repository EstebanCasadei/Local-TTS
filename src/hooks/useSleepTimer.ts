import { useCallback, useEffect, useRef, useState } from "react";

export type SleepTimerMode =
  | { kind: "duration"; endsAt: number }
  | { kind: "chapter"; chapterId: number | null };

/**
 * Countdown timer that pauses playback either after a fixed duration or once
 * the current chapter finishes. Fully local — no server, no dependency on
 * the tab staying focused (uses wall-clock time via Date.now(), not a naive
 * tick counter, so it stays accurate even if the interval is throttled in a
 * background tab).
 */
export function useSleepTimer(onExpire: () => void) {
  const [mode, setMode] = useState<SleepTimerMode | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!mode || mode.kind !== "duration") {
      setRemainingMs(null);
      return;
    }
    // `id` is assigned right after setInterval() below, but tick() runs
    // synchronously once before that — it only needs `id` in the expiry
    // branch, which can't happen on that first synchronous call.
    let id: ReturnType<typeof setInterval>;
    const tick = () => {
      const remaining = mode.endsAt - Date.now();
      if (remaining <= 0) {
        // Clear immediately instead of waiting for the `mode` state update to
        // re-run this effect's cleanup — with fake/advanced timers, the
        // interval could otherwise fire again (with the same, now-expired
        // `mode`) before React processes that update, calling onExpire twice.
        clearInterval(id);
        setRemainingMs(null);
        setMode(null);
        onExpireRef.current();
        return;
      }
      setRemainingMs(remaining);
    };
    tick();
    id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mode]);

  const startDuration = useCallback((minutes: number) => {
    setMode({ kind: "duration", endsAt: Date.now() + minutes * 60_000 });
  }, []);

  const startEndOfChapter = useCallback((chapterId: number | null) => {
    setMode({ kind: "chapter", chapterId });
  }, []);

  const cancel = useCallback(() => {
    setMode(null);
  }, []);

  /**
   * Called by the reading page whenever the active chapter changes. No-ops
   * unless a "pause at end of chapter" timer is armed for the chapter that
   * just ended, so it doesn't fire on manual chapter jumps made for other
   * reasons before the timer was set.
   */
  const notifyChapterChanged = useCallback((chapterId: number | null) => {
    setMode((prev) => {
      if (prev?.kind !== "chapter" || prev.chapterId === chapterId) return prev;
      onExpireRef.current();
      return null;
    });
  }, []);

  return {
    active: mode != null,
    mode,
    remainingMs,
    startDuration,
    startEndOfChapter,
    cancel,
    notifyChapterChanged,
  };
}
