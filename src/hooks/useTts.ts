import { useCallback, useEffect, useRef, useState } from "react";
import { TtsClient, VOICES, type DownloadProgress } from "../lib/ttsClient";
import { chunkText } from "../lib/chunker";
import { decodeWav, getAudioContext, formatDuration } from "../lib/audio";
import { PlaybackQueue, PlaybackState, type PlaybackSnapshot } from "../lib/playbackQueue";

// The synthesis + playback lifecycle. With the streaming queue, playback starts
// as soon as the first chunk arrives — no waiting for all chunks to synthesize.
export type TtsStatus =
  | "idle"
  | "downloading-voice"
  | "synthesizing" // still generating chunks (playback may have already started)
  | "playing"
  | "buffering" // playing but waiting for the next chunk
  | "paused"
  | "done" // all chunks played
  | "error";

export interface TtsState {
  status: TtsStatus;
  voiceId: string;
  voices: typeof VOICES;
  speed: number;
  volume: number;
  /** IDs of voices already downloaded in this session (or previous ones). */
  downloadedVoiceIds: string[];
  /** Voice currently being downloaded, if any. */
  downloadingVoiceId: string | null;
  downloadProgress: number | null;
  chunksDone: number;
  chunksTotal: number;
  isPlaying: boolean;
  currentPosition: number;
  duration: number;
  /** Audio synthesis chunks, aligned with chunkStartTimes for karaoke. */
  synthesisChunks: string[];
  chunkStartTimes: (number | undefined)[];
  /** Currently playing synthesis chunk index (for progress saving). */
  activeChunkIndex: number;
  error: string | null;
}

export interface UseTts extends TtsState {
  setVoice: (voiceId: string) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  rewind: () => void;
  forward: () => void;
  downloadAndSetVoice: (voiceId: string) => void;
  /** If preChunked is provided, uses those strings directly instead of re-splitting text. */
  synthesize: (
    text: string,
    bookId?: string,
    chunkIds?: string[],
    preChunked?: string[],
    resumeFrom?: { chunkIndex: number; offsetLocal: number },
  ) => Promise<void>;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekToChunk: (index: number, localTime?: number) => void;
  cancel: () => void;
  reset: () => void;
  formatPosition: () => string;
  formatTotal: () => string;
}

const SPEED_STORAGE_KEY = "local-tts:speed";
const VOLUME_STORAGE_KEY = "local-tts:volume";
const DOWNLOADED_VOICES_KEY = "local-tts:downloaded-voices";

function loadSavedSpeed(): number {
  const saved = localStorage.getItem(SPEED_STORAGE_KEY);
  if (!saved) return 1;
  const speed = Number.parseFloat(saved);
  return Number.isFinite(speed) && speed >= 0.5 && speed <= 3 ? speed : 1;
}

function loadSavedVolume(): number {
  const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
  if (!saved) return 1;
  const volume = Number.parseFloat(saved);
  return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1;
}

function loadDownloadedVoiceIds(): string[] {
  try {
    const saved = localStorage.getItem(DOWNLOADED_VOICES_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : null;
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
      return parsed;
    }
  } catch {
    // ignore malformed localStorage
  }
  return [];
}

const IDLE_STATE: TtsState = {
  status: "idle",
  voiceId: VOICES[0].id,
  voices: VOICES,
  speed: 1,
  volume: 1,
  downloadedVoiceIds: [],
  downloadingVoiceId: null,
  downloadProgress: null,
  chunksDone: 0,
  chunksTotal: 0,
  isPlaying: false,
  currentPosition: 0,
  duration: 0,
  synthesisChunks: [],
  chunkStartTimes: [],
  activeChunkIndex: 0,
  error: null,
};

export function useTts(): UseTts {
  const clientRef = useRef<TtsClient | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);
  const speedRef = useRef(1);
  const volumeRef = useRef(1);
  const isDownloadingVoiceRef = useRef(false);

  // Initialize speed/volume/downloaded-voices from localStorage so the user's
  // preferences persist across sessions.
  const [state, setState] = useState<TtsState>(() => ({
    ...IDLE_STATE,
    speed: loadSavedSpeed(),
    volume: loadSavedVolume(),
    downloadedVoiceIds: loadDownloadedVoiceIds(),
  }));

  // Create the TTS client once. Its worker is shared across mounts (see
  // TtsClient), so switching documents doesn't force the voice model to
  // reload — only cancel any in-flight synthesis on unmount.
  useEffect(() => {
    const client = new TtsClient();
    clientRef.current = client;
    return () => {
      client.cancel();
      queueRef.current?.stop();
    };
  }, []);

  const update = useCallback((patch: Partial<TtsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Sync speedRef/volumeRef so the queue callback always has the latest values.
  useEffect(() => {
    speedRef.current = state.speed;
  }, [state.speed]);
  useEffect(() => {
    volumeRef.current = state.volume;
  }, [state.volume]);

  const setVoice = useCallback((voiceId: string) => {
    queueRef.current?.stop();
    queueRef.current = null;
    setState((prev) => ({
      ...IDLE_STATE,
      voiceId,
      speed: prev.speed,
      volume: prev.volume,
      downloadedVoiceIds: prev.downloadedVoiceIds,
    }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(3, speed));
    setState((prev) => ({ ...prev, speed: clamped }));
    // Persist to localStorage so the preference survives across sessions.
    localStorage.setItem(SPEED_STORAGE_KEY, String(clamped));
    // Live speed change: re-seek to current position with the new rate.
    void queueRef.current?.setRate(clamped);
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setState((prev) => ({ ...prev, volume: clamped }));
    // Persist to localStorage so the preference survives across sessions.
    localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    // Apply immediately if a queue is already playing.
    queueRef.current?.setVolume(clamped);
  }, []);

  const downloadAndSetVoice = useCallback(
    (voiceId: string) => {
      const client = clientRef.current;
      if (!client || isDownloadingVoiceRef.current) return;

      if (voiceId === state.voiceId) return;
      if (state.downloadedVoiceIds.includes(voiceId)) {
        // Already downloaded — just switch the active voice and let the
        // caller re-synthesize the current document.
        queueRef.current?.stop();
        queueRef.current = null;
        setState((prev) => ({ ...prev, voiceId }));
        return;
      }

      isDownloadingVoiceRef.current = true;
      // Pause playback while the new model downloads.
      void queueRef.current?.pause();
      setState((prev) => ({
        ...prev,
        status: "downloading-voice",
        downloadingVoiceId: voiceId,
        downloadProgress: null,
      }));

      client
        .downloadVoice(voiceId, (p) => {
          update({
            downloadProgress: p.total > 0 ? p.loaded / p.total : null,
          });
        })
        .then(() => {
          setState((prev) => {
            const ids = Array.from(new Set([...prev.downloadedVoiceIds, voiceId]));
            localStorage.setItem(DOWNLOADED_VOICES_KEY, JSON.stringify(ids));
            // Switch voice without resetting chunk state — the reading page
            // will re-synthesize the current document and resume from where
            // the user left off.
            return { ...prev, voiceId, downloadedVoiceIds: ids, status: "idle" };
          });
          queueRef.current?.stop();
          queueRef.current = null;
        })
        .catch((err) => {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
            downloadingVoiceId: null,
            downloadProgress: null,
          }));
        })
        .finally(() => {
          isDownloadingVoiceRef.current = false;
        });
    },
    [state.downloadedVoiceIds, state.voiceId, update],
  );

  const synthesize = useCallback(
    async (
      text: string,
      bookId?: string,
      chunkIds?: string[],
      preChunked?: string[],
      resumeFrom?: { chunkIndex: number; offsetLocal: number },
    ) => {
      const client = clientRef.current;
      if (!client) return;

      // Stop any existing playback.
      queueRef.current?.stop();
      queueRef.current = null;

      // Use pre-chunked texts if provided (so synthesis chunks align 1:1 with
      // repository chunks for progress tracking). Otherwise, split the text.
      const chunks = preChunked ?? chunkText(text);
      if (chunks.length === 0) {
        update({ status: "error", error: "No hay texto para sintetizar." });
        return;
      }

      update({
        status: "downloading-voice",
        downloadProgress: null,
        chunksDone: 0,
        chunksTotal: chunks.length,
        error: null,
        isPlaying: false,
        currentPosition: 0,
        duration: 0,
        synthesisChunks: chunks,
        chunkStartTimes: new Array(chunks.length),
        activeChunkIndex: 0,
      });

      // If resuming mid-document, tell the worker to synthesize the target
      // chunk first. Playback will start as soon as that chunk arrives, while
      // earlier chunks are re-synthesized in the background.
      if (resumeFrom) {
        client.prioritize(resumeFrom.chunkIndex);
      }

      // The queue is created lazily after the first chunk decodes, because
      // decodeWav() may close and recreate the AudioContext at a different
      // sample rate (Piper outputs 16kHz or 22.05kHz depending on the voice).
      // If we created the queue upfront with the wrong context, all
      // source.start() calls would silently fail on a closed context.
      let queue: PlaybackQueue | null = null;
      let firstChunkPlayed = false;
      const decodePromises: Promise<void>[] = [];

      const ensureQueue = () => {
        if (queue) return queue;
        // getAudioContext() now returns the context at the correct sample rate
        // (decodeWav already called it with the WAV's sample rate).
        const ctx = getAudioContext();
        queue = new PlaybackQueue(ctx, {
          onChange: (snap: PlaybackSnapshot) => {
            const status = mapQueueState(snap.state);
            setState((prev) => ({
              ...prev,
              status,
              isPlaying: snap.playing,
              currentPosition: snap.position,
              duration: snap.duration,
              chunkStartTimes: snap.chunkStartTimes,
              activeChunkIndex: snap.index,
            }));
          },
        });
        queue.setPlan(chunks.length);
        // Apply the user's saved speed/volume preferences to the queue — it
        // defaults to 1, but the user may have changed these before clicking play.
        // Use refs (always current) instead of state values (stale in closure).
        queue.setRate(speedRef.current);
        queue.setVolume(volumeRef.current);
        queueRef.current = queue;
        return queue;
      };

      try {
        const result = await client.synthesize(
          state.voiceId,
          chunks,
          {
            onVoiceProgress: (p: DownloadProgress) => {
              update({
                status: "downloading-voice",
                downloadProgress: p.total > 0 ? p.loaded / p.total : null,
              });
            },
            onVoiceReady: () => {
              // The voice is now loaded in the worker/OPFS, so mark it as
              // downloaded for the UI icons.
              setState((prev) => ({
                ...prev,
                status: "synthesizing",
                downloadProgress: null,
                downloadedVoiceIds: Array.from(new Set([...prev.downloadedVoiceIds, prev.voiceId])),
              }));
            },
            onChunk: ({ wav, index }) => {
              // Decode and push to the queue immediately — the queue schedules
              // it on the AudioContext clock. If it's the first chunk, the
              // queue starts playing right away (streaming).
              const p = decodeWav(wav).then((buffer) => {
                const q = ensureQueue();
                q.push(index, buffer);
                setState((prev) => ({
                  ...prev,
                  chunksDone: prev.chunksDone + 1,
                }));

                // Start playback as soon as the first usable chunk arrives:
                // - If resuming, start from the resume chunk/offset.
                // - Otherwise, play from the first chunk (streaming).
                if (!firstChunkPlayed) {
                  if (resumeFrom && index === resumeFrom.chunkIndex) {
                    firstChunkPlayed = true;
                    void q.seekToChunk(resumeFrom.chunkIndex, resumeFrom.offsetLocal);
                  } else if (!resumeFrom) {
                    firstChunkPlayed = true;
                    void q.play();
                  }
                }
              });
              decodePromises.push(p);
            },
            onChunkFailed: ({ index, message }) => {
              console.warn(`[useTts] chunk ${index + 1} failed:`, message);
              queue?.markSkipped(index);
            },
          },
          bookId,
          chunkIds,
        );

        if (result.cancelled) {
          update({ status: "idle" });
          return;
        }

        if (result.ok === 0) {
          update({ status: "error", error: "No se pudo sintetizar ningún fragmento." });
          return;
        }

        // Wait for any in-flight decodeWav promises to finish before closing
        // the queue — otherwise the last chunk's buffer may not be pushed yet,
        // and close() would mark it as skipped (cutting off the last sentence).
        await Promise.all(decodePromises);

        // Tell the queue no more chunks are coming.
        const q = queueRef.current as PlaybackQueue | null;
        q?.close();
      } catch (err) {
        update({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [state.voiceId, update],
  );

  const play = useCallback(() => {
    queueRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    queueRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    queueRef.current?.seek(time);
  }, []);

  const seekToChunk = useCallback((index: number, localTime?: number) => {
    // If the target chunk hasn't synthesized yet, jump the worker straight
    // to it instead of leaving it to finish every chunk in between first.
    clientRef.current?.prioritize(index);
    queueRef.current?.seekToChunk(index, localTime);
  }, []);

  const rewind = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    void q.seek(Math.max(0, q.position - 15));
  }, []);

  const forward = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    void q.seek(Math.min(q.duration, q.position + 15));
  }, []);

  const cancel = useCallback(() => {
    clientRef.current?.cancel();
    queueRef.current?.stop();
    queueRef.current = null;
    update({
      status: "idle",
      chunksDone: 0,
      chunksTotal: 0,
      isPlaying: false,
      currentPosition: 0,
      duration: 0,
      synthesisChunks: [],
      chunkStartTimes: [],
      activeChunkIndex: 0,
    });
  }, [update]);

  const reset = useCallback(() => {
    clientRef.current?.cancel();
    queueRef.current?.stop();
    queueRef.current = null;
    setState((prev) => ({
      ...IDLE_STATE,
      voiceId: prev.voiceId,
      speed: prev.speed,
      volume: prev.volume,
      downloadedVoiceIds: prev.downloadedVoiceIds,
    }));
  }, []);

  const formatPosition = useCallback(
    () => formatDuration(state.currentPosition),
    [state.currentPosition],
  );
  const formatTotal = useCallback(() => formatDuration(state.duration), [state.duration]);

  return {
    ...state,
    setVoice,
    setSpeed,
    setVolume,
    rewind,
    forward,
    downloadAndSetVoice,
    synthesize,
    play,
    pause,
    seek,
    seekToChunk,
    cancel,
    reset,
    formatPosition,
    formatTotal,
  };
}

/** Maps PlaybackQueue states to TtsStatus. */
function mapQueueState(qs: PlaybackState): TtsStatus {
  switch (qs) {
    case PlaybackState.PLAYING:
      return "playing";
    case PlaybackState.BUFFERING:
      return "buffering";
    case PlaybackState.PAUSED:
      return "paused";
    case PlaybackState.DONE:
      return "done";
    default:
      return "idle";
  }
}
