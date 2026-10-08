import { useCallback, useEffect, useRef, useState } from "react";
import { TtsClient, VOICES } from "../lib/ttsClient";
import { chunkText } from "../lib/chunker";
import { closeDecodeContext, decodeWav, formatDuration } from "../lib/audio";
import { PlaybackQueue, type PlaybackSnapshot } from "../lib/playbackQueue";
import type { SelectionItem } from "./queue";

interface ResumePoint {
  chunkIndex: number;
  offsetLocal: number;
}
interface PlayerState {
  itemId: string | null;
  status: "idle" | "loading" | "playing" | "paused" | "buffering" | "done" | "error";
  position: number;
  duration: number;
  chunkIndex: number;
  chunkStartTimes: (number | undefined)[];
  chunksDone: number;
  chunksTotal: number;
  downloadPercent: number | null;
  error: string | null;
}
const idleState: PlayerState = {
  itemId: null,
  status: "idle",
  position: 0,
  duration: 0,
  chunkIndex: 0,
  chunkStartTimes: [],
  chunksDone: 0,
  chunksTotal: 0,
  downloadPercent: null,
  error: null,
};
function savedNumber(key: string, fallback: number, min: number, max: number) {
  const value = Number(localStorage.getItem(key) ?? fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

/** Reuse the application's worker protocol, WAV decoder and audio-clock queue. */
export function useSelectionPlayback() {
  const client = useRef<TtsClient | null>(null);
  const queue = useRef<PlaybackQueue | null>(null);
  const operation = useRef(0);
  const currentItem = useRef<SelectionItem | null>(null);
  const paused = useRef(false);
  const resumePoints = useRef(new Map<string, ResumePoint>());
  const [state, setState] = useState<PlayerState>(idleState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [voiceId, setVoiceId] = useState(() => {
    const saved = localStorage.getItem("local-tts:voice");
    return VOICES.some((voice) => voice.id === saved) ? saved! : VOICES[0].id;
  });
  const voiceRef = useRef(voiceId);
  const [speed, setSpeedState] = useState(() => savedNumber("local-tts:speed", 1, 0.5, 2));
  const [volume, setVolumeState] = useState(() => savedNumber("local-tts:volume", 1, 0, 1));
  const settings = useRef({ speed, volume });
  settings.current = { speed, volume };

  const remember = useCallback(() => {
    const item = currentItem.current;
    const snapshot = stateRef.current;
    if (item && snapshot.itemId === item.id)
      resumePoints.current.set(
        item.id,
        snapshot.status === "done"
          ? { chunkIndex: 0, offsetLocal: 0 }
          : {
              chunkIndex: snapshot.chunkIndex,
              offsetLocal: Math.max(
                0,
                snapshot.position - (snapshot.chunkStartTimes[snapshot.chunkIndex] ?? 0),
              ),
            },
      );
  }, []);

  const stop = useCallback(() => {
    ++operation.current;
    client.current?.cancel();
    void queue.current?.dispose();
    queue.current = null;
    currentItem.current = null;
    closeDecodeContext();
    setState(idleState);
  }, []);

  const dispose = useCallback(() => {
    ++operation.current;
    client.current?.cancel();
    client.current?.restartWorker();
    void queue.current?.dispose();
    closeDecodeContext();
  }, []);

  useEffect(() => {
    client.current = new TtsClient();
    return dispose;
  }, [dispose]);

  const start = useCallback(
    (item: SelectionItem, restart = false) => {
      remember();
      stop();
      currentItem.current = item;
      paused.current = false;
      const id = operation.current;
      const stale = () => id !== operation.current;
      const chunks = chunkText(item.text);
      const resume = restart ? undefined : resumePoints.current.get(item.id);
      const decodes: Promise<void>[] = [];
      let started = false;
      let activeQueue: PlaybackQueue | null = null;
      setState({
        ...idleState,
        itemId: item.id,
        status: "loading",
        chunksTotal: chunks.length,
        chunkIndex: resume?.chunkIndex ?? 0,
      });
      const fail = (message: string) => {
        if (stale()) return;
        ++operation.current;
        client.current?.cancel();
        void activeQueue?.dispose();
        queue.current = null;
        closeDecodeContext();
        setState((previous) => ({ ...previous, status: "error", error: message }));
      };
      if (!chunks.length) {
        fail("No hay texto para reproducir.");
        return;
      }
      void client
        .current!.synthesize(voiceRef.current, chunks, {
          onVoiceProgress: (progress) => {
            if (!stale())
              setState((previous) => ({
                ...previous,
                downloadPercent: progress.total
                  ? Math.min(100, (progress.loaded / progress.total) * 100)
                  : null,
              }));
          },
          onVoiceReady: () => {
            if (!stale()) setState((previous) => ({ ...previous, downloadPercent: null }));
          },
          onChunk: ({ wav, index }) => {
            if (stale()) return;
            const decoding = decodeWav(wav)
              .then(async (buffer) => {
                if (stale()) return;
                if (!activeQueue) {
                  activeQueue = new PlaybackQueue({
                    onChange: (snapshot: PlaybackSnapshot) => {
                      if (stale()) return;
                      setState((previous) => ({
                        ...previous,
                        status:
                          snapshot.state === "idle"
                            ? paused.current
                              ? "paused"
                              : "loading"
                            : snapshot.state,
                        position: snapshot.position,
                        duration: snapshot.duration,
                        chunkIndex: snapshot.index,
                        chunkStartTimes: snapshot.chunkStartTimes,
                      }));
                    },
                  });
                  activeQueue.setPlan(chunks.length);
                  void activeQueue.setRate(settings.current.speed);
                  activeQueue.setVolume(settings.current.volume);
                  queue.current = activeQueue;
                }
                activeQueue.push(index, buffer);
                setState((previous) => ({ ...previous, chunksDone: previous.chunksDone + 1 }));
                if (!started && index === (resume?.chunkIndex ?? 0)) {
                  started = true;
                  if (resume) await activeQueue.seekToChunk(resume.chunkIndex, resume.offsetLocal);
                  else if (!paused.current) await activeQueue.play();
                  if (paused.current && !stale()) await activeQueue.pause();
                }
              })
              .catch(() => fail("No se pudo decodificar el audio. Inténtalo de nuevo."));
            decodes.push(decoding);
          },
          onChunkFailed: () => fail("No se pudo generar un fragmento. Inténtalo de nuevo."),
        })
        .then(async (result) => {
          await Promise.all(decodes);
          if (stale()) return;
          closeDecodeContext();
          if (result.cancelled) return;
          if (!result.ok || result.failed.length) {
            fail("No se pudo completar la lectura. Inténtalo de nuevo.");
            return;
          }
          activeQueue?.close();
        })
        .catch(() =>
          fail("No se pudo preparar la voz. Comprueba tu conexión y vuelve a intentarlo."),
        );
    },
    [remember, stop],
  );

  const changeVoice = useCallback(
    (id: string) => {
      if (id === voiceRef.current || !VOICES.some((voice) => voice.id === id)) return;
      const item = currentItem.current;
      remember();
      stop();
      client.current?.restartWorker();
      voiceRef.current = id;
      setVoiceId(id);
      localStorage.setItem("local-tts:voice", id);
      if (item) start(item);
    },
    [remember, stop, start],
  );

  const setSpeed = (value: number) => {
    const next = Math.max(0.5, Math.min(2, value));
    setSpeedState(next);
    settings.current.speed = next;
    localStorage.setItem("local-tts:speed", String(next));
    void queue.current?.setRate(next);
  };
  const setVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolumeState(next);
    settings.current.volume = next;
    localStorage.setItem("local-tts:volume", String(next));
    queue.current?.setVolume(next);
  };
  const pause = () => {
    paused.current = true;
    void queue.current?.pause();
    setState((previous) => ({ ...previous, status: "paused" }));
  };
  const play = () => {
    paused.current = false;
    if (stateRef.current.status === "done" || stateRef.current.status === "error") {
      if (currentItem.current) start(currentItem.current, stateRef.current.status === "done");
    } else if (queue.current) void queue.current.play();
    else setState((previous) => ({ ...previous, status: "loading" }));
  };
  return {
    ...state,
    voiceId,
    voices: VOICES,
    speed,
    volume,
    start,
    stop,
    play,
    pause,
    changeVoice,
    setSpeed,
    setVolume,
    forget: (id: string) => resumePoints.current.delete(id),
    seek: (time: number) => {
      void queue.current?.seek(time);
    },
    rewind: () => {
      void queue.current?.seek(Math.max(0, stateRef.current.position - 15));
    },
    forward: () => {
      void queue.current?.seek(Math.min(stateRef.current.duration, stateRef.current.position + 15));
    },
    formatPosition: formatDuration(state.position),
    formatTotal: formatDuration(state.duration),
  };
}
