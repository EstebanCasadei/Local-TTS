import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSleepTimer } from "./useSleepTimer.ts";

describe("useSleepTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts inactive", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));
    expect(result.current.active).toBe(false);
    expect(result.current.remainingMs).toBeNull();
  });

  it("fires onExpire and deactivates once the duration elapses", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));

    act(() => {
      result.current.startDuration(15);
    });
    expect(result.current.active).toBe(true);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(15 * 60_000 + 1000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it("cancel deactivates without firing onExpire", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));

    act(() => {
      result.current.startDuration(15);
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.active).toBe(false);

    act(() => {
      vi.advanceTimersByTime(20 * 60_000);
    });
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("end-of-chapter mode fires only when the chapter actually changes", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));

    act(() => {
      result.current.startEndOfChapter(0);
    });
    expect(result.current.active).toBe(true);

    // Same chapter — no-op.
    act(() => {
      result.current.notifyChapterChanged(0);
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.active).toBe(true);

    // Moved to a different chapter — fires and deactivates.
    act(() => {
      result.current.notifyChapterChanged(1);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it("notifyChapterChanged is a no-op when no chapter timer is armed", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer(onExpire));

    act(() => {
      result.current.notifyChapterChanged(3);
    });
    expect(onExpire).not.toHaveBeenCalled();
  });
});
