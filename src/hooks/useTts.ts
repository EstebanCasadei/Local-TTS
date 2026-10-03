import { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { TtsClient, VOICES, type DownloadProgress } from "../lib/ttsClient";
import { chunkText } from "../lib/chunker";
import { decodeWav, formatDuration, closeDecodeContext } from "../lib/audio";
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
    resumeFrom?: { chunkIndex: number; offsetLocal: number; chunkStartTime?: number },
  ) => Promise<void>;
  play: () => void;
  pause: () => void;
  pauseForExport: () => Promise<void>;
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
const VOICE_STORAGE_KEY = "local-tts:voice";

function loadSavedVoiceId(): string {
  const saved = localStorage.getItem(VOICE_STORAGE_KEY);
  return saved && VOICES.some((v) => v.id === saved) ? saved : VOICES[0].id;
}

function loadSavedSpeed(): number {
  const saved = localStorage.getItem(SPEED_STORAGE_KEY);
  if (!saved) return 1;
  const speed = Number.parseFloat(saved);
  return Number.isFinite(speed) && speed >= 0.5 && speed <= 2 ? speed : 1;
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
  // Bumped every time a new synthesize()/downloadAndSetVoice() flow starts.
  // Async callbacks capture the value at their own start and check it before
  // touching state — so a stale flow (e.g. a synthesize() call whose worker
  // request got rejected by a later restartWorker()) can't clobber state
  // set by a flow that superseded it.
  const opRef = useRef(0);
  const lastSynthesisRef = useRef<{
    text: string;
    bookId?: string;
    chunkIds?: string[];
    chunks?: string[];
  } | null>(null);
  const exportResumeRef = useRef<{
    chunkIndex: number;
    offsetLocal: number;
    chunkStartTime?: number;
  } | null>(null);

  // Initialize voice/speed/volume/downloaded-voices from localStorage so the
  // user's preferences persist across sessions.
  const [state, setState] = useState<TtsState>(() => ({
    ...IDLE_STATE,
    voiceId: loadSavedVoiceId(),
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
      queueRef.current?.dispose();
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
    queueRef.current?.dispose();
    queueRef.current = null;
    localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
    setState((prev) => ({
      ...IDLE_STATE,
      voiceId,
      speed: prev.speed,
      volume: prev.volume,
      downloadedVoiceIds: prev.downloadedVoiceIds,
    }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(2, speed));
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

      // Stop whatever the previous voice was doing and free its WASM memory
      // before loading a new model — otherwise the worker's queue would
      // process the switch only after the old voice finishes synthesizing
      // every remaining chunk of the current document (it can take a very
      // long time), and on low-end devices two resident ONNX models can
      // exhaust WASM memory and break playback for every voice afterwards.
      client.cancel();
      client.restartWorker();
      // Any in-flight synthesize() for the previous voice is about to have
      // its worker request rejected by that restartWorker() call above —
      // bump the generation so its (stale) catch handler no-ops instead of
      // overwriting the state we're about to set for this new voice.
      const myOp = ++opRef.current;

      if (state.downloadedVoiceIds.includes(voiceId)) {
        // Already downloaded — just switch the active voice and let the
        // caller re-synthesize the current document.
        queueRef.current?.dispose();
        queueRef.current = null;
        localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
        setState((prev) => ({
          ...prev,
          voiceId,
          status: "idle",
          downloadingVoiceId: null,
          downloadProgress: null,
        }));
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
          if (opRef.current !== myOp) return;
          update({
            downloadProgress: p.total > 0 ? p.loaded / p.total : null,
          });
        })
        .then(() => {
          if (opRef.current !== myOp) return;
          localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
          setState((prev) => {
            const ids = Array.from(new Set([...prev.downloadedVoiceIds, voiceId]));
            localStorage.setItem(DOWNLOADED_VOICES_KEY, JSON.stringify(ids));
            // Switch voice without resetting chunk state — the reading page
            // will re-synthesize the current document and resume from where
            // the user left off.
            return {
              ...prev,
              voiceId,
              downloadedVoiceIds: ids,
              status: "idle",
              downloadingVoiceId: null,
              downloadProgress: null,
            };
          });
          queueRef.current?.dispose();
          queueRef.current = null;
        })
        .catch((err) => {
          if (opRef.current !== myOp) return;
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
      resumeFrom?: { chunkIndex: number; offsetLocal: number; chunkStartTime?: number },
    ) => {
      const client = clientRef.current;
      if (!client) return;

      // Invalidates any still-pending callbacks from a previous synthesize()
      // call (e.g. one whose worker request got rejected by a voice-switch
      // restartWorker(), or one superseded by this newer call) so they can't
      // clobber the state this call is about to set.
      const myOp = ++opRef.current;
      const stale = () => opRef.current !== myOp;
      exportResumeRef.current = null;
      lastSynthesisRef.current = { text, bookId, chunkIds, chunks: preChunked };

      // Stop any existing playback.
      queueRef.current?.dispose();
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

      // The queue is created lazily after the first chunk decodes. It creates
      // its own AudioContext (owned and closed in dispose()), separate from the
      // decode context in audio.ts. This avoids leaking AudioContexts on iOS
      // Safari, which limits running contexts to ~4.
      let queue: PlaybackQueue | null = null;
      let firstChunkPlayed = false;
      const decodePromises: Promise<void>[] = [];

      const ensureQueue = () => {
        if (queue) return queue;
        queue = new PlaybackQueue({
          onChange: (snap: PlaybackSnapshot) => {
            if (stale()) return;
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
            // Evict played stretched buffers to reduce peak memory on iOS
            // Safari. Only on touch/mobile devices — desktop has plenty of
            // memory and the O(n) iteration every 100ms is unnecessary overhead.
            if (matchMedia("(hover: none)").matches) {
              queue?.releasePlayedBuffers();
            }
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
              if (stale()) return;
              update({
                status: "downloading-voice",
                downloadProgress: p.total > 0 ? p.loaded / p.total : null,
              });
            },
            onVoiceReady: () => {
              if (stale()) return;
              // The voice is now loaded in the worker/OPFS, so mark it as
              // downloaded for the UI icons.
              setState((prev) => ({
                ...prev,
                status: "synthesizing",
                downloadingVoiceId: null,
                downloadProgress: null,
                downloadedVoiceIds: Array.from(new Set([...prev.downloadedVoiceIds, prev.voiceId])),
              }));
            },
            onChunk: ({ wav, index }) => {
              // Decode and push to the queue immediately — the queue schedules
              // it on the AudioContext clock. If it's the first chunk, the
              // queue starts playing right away (streaming).
              const p = decodeWav(wav)
                .then((buffer) => {
                  if (stale()) return;
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
                      void q.seekToChunk(
                        resumeFrom.chunkIndex,
                        resumeFrom.offsetLocal,
                        resumeFrom.chunkStartTime,
                      );
                    } else if (!resumeFrom) {
                      firstChunkPlayed = true;
                      void q.play();
                    }
                  }
                })
                .catch((err) => {
                  if (stale()) return;
                  // decodeAudioData can fail on iOS Safari under memory pressure
                  // (UnknownError) — skip the chunk so playback continues past it
                  // instead of crashing the whole synthesis.
                  queue?.markSkipped(index);
                  Sentry.captureException(err, {
                    tags: { error_source: "decode_wav" },
                    extra: { chunkIndex: index },
                  });
                });
              decodePromises.push(p);
            },
            onChunkFailed: ({ index }) => {
              if (stale()) return;
              queue?.markSkipped(index);
            },
          },
          bookId,
          chunkIds,
        );

        if (stale()) return;

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
        if (stale()) return;

        // All chunks decoded — free the decode AudioContext to reduce peak
        // memory on iOS Safari. AudioBuffers are independent of the context.
        closeDecodeContext();

        // Tell the queue no more chunks are coming.
        const q = queueRef.current as PlaybackQueue | null;
        q?.close();
      } catch (err) {
        if (stale()) return;
        update({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        Sentry.captureException(err, {
          tags: { error_source: "tts_synthesize" },
        });
      }
    },
    [state.voiceId, update],
  );

  const play = useCallback(() => {
    const resume = exportResumeRef.current;
    const source = lastSynthesisRef.current;
    if (resume && source) {
      void synthesize(source.text, source.bookId, source.chunkIds, source.chunks, resume);
      return;
    }
    queueRef.current?.play();
  }, [synthesize]);

  const pauseForExport = useCallback(async () => {
    // Invalidate late synthesis/decode callbacks before freeing the playback model.
    ++opRef.current;
    clientRef.current?.cancel();
    clientRef.current?.restartWorker();
    const queue = queueRef.current;
    queueRef.current = null;
    await queue?.pause();
    const position = queue?.position ?? state.currentPosition;
    const index = queue?.currentIndex ?? state.activeChunkIndex;
    const chunkStartTime = queue?.timeAtChunk(index) ?? state.chunkStartTimes[index];
    if (lastSynthesisRef.current) {
      exportResumeRef.current =
        state.status === "done"
          ? { chunkIndex: 0, offsetLocal: 0 }
          : {
              chunkIndex: index,
              offsetLocal: Math.max(0, position - (chunkStartTime ?? 0)),
              chunkStartTime,
            };
    }
    update({
      status: lastSynthesisRef.current ? "paused" : "idle",
      isPlaying: false,
      currentPosition: position,
      activeChunkIndex: index,
    });
    await queue?.dispose();
    closeDecodeContext();
  }, [state.currentPosition, state.status, state.activeChunkIndex, state.chunkStartTimes, update]);

  const pause = useCallback(() => {
    queueRef.current?.pause();
  }, []);

  const seek = useCallback(
    (time: number) => {
      if (exportResumeRef.current) {
        const position = Math.max(0, time);
        let index = 0;
        state.chunkStartTimes.forEach((start, chunkIndex) => {
          if (start != null && start <= position) index = chunkIndex;
        });
        exportResumeRef.current = {
          chunkIndex: index,
          offsetLocal: Math.max(0, position - (state.chunkStartTimes[index] ?? 0)),
          chunkStartTime: state.chunkStartTimes[index],
        };
        update({ currentPosition: position, activeChunkIndex: index });
        return;
      }
      queueRef.current?.seek(time);
    },
    [state.chunkStartTimes, update],
  );

  const seekToChunk = useCallback(
    (index: number, localTime?: number) => {
      if (exportResumeRef.current) {
        exportResumeRef.current = {
          chunkIndex: index,
          offsetLocal: localTime ?? 0,
          chunkStartTime: state.chunkStartTimes[index],
        };
        update({
          activeChunkIndex: index,
          currentPosition:
            (state.chunkStartTimes[index] ?? state.currentPosition) + (localTime ?? 0),
        });
        return;
      }
      // If the target chunk hasn't synthesized yet, jump the worker straight
      // to it instead of leaving it to finish every chunk in between first.
      clientRef.current?.prioritize(index);
      queueRef.current?.seekToChunk(index, localTime);
    },
    [state.chunkStartTimes, state.currentPosition, update],
  );

  const rewind = useCallback(() => {
    if (exportResumeRef.current) {
      seek(Math.max(0, state.currentPosition - 15));
      return;
    }
    const q = queueRef.current;
    if (!q) return;
    void q.seek(Math.max(0, q.position - 15));
  }, [seek, state.currentPosition]);

  const forward = useCallback(() => {
    if (exportResumeRef.current) {
      seek(Math.min(Math.max(0, state.duration - 0.001), state.currentPosition + 15));
      return;
    }
    const q = queueRef.current;
    if (!q) return;
    void q.seek(Math.min(q.duration, q.position + 15));
  }, [seek, state.currentPosition, state.duration]);

  const cancel = useCallback(() => {
    exportResumeRef.current = null;
    lastSynthesisRef.current = null;
    clientRef.current?.cancel();
    queueRef.current?.dispose();
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
    exportResumeRef.current = null;
    lastSynthesisRef.current = null;
    clientRef.current?.cancel();
    queueRef.current?.dispose();
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
    pauseForExport,
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
