import { useCallback, useState } from "react";
import type { ReadingState } from "../types/reading.ts";

const DEFAULT_STATE: ReadingState = {
  isPlaying: false,
  speed: 1,
  voice: "default",
  personality: "neutral",
  tonal: false,
};

export function usePlayback() {
  const [state, setState] = useState<ReadingState>(DEFAULT_STATE);

  const togglePlay = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);

  return { ...state, setSpeed, togglePlay };
}
