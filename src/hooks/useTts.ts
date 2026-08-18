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
  downloadProgress: number | null;
  chunksDone: number;
  chunksTotal: number;
  isPlaying: boolean;
  currentPosition: number;
  duration: number;
  activeChunkIndex: number; // currently playing chunk (for karaoke sync)
  error: string | null;
}

export interface UseTts extends TtsState {
  setVoice: (voiceId: string) => void;
  setSpeed: (speed: number) => void;
  synthesize: (text: string, bookId?: string, chunkIds?: string[]) => Promise<void>;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekToChunk: (index: number) => void;
  cancel: () => void;
  reset: () => void;
  formatPosition: () => string;
  formatTotal: () => string;
}

const IDLE_STATE: TtsState = {
  status: "idle",
  voiceId: VOICES[0].id,
  voices: VOICES,
  speed: 1,
  downloadProgress: null,
  chunksDone: 0,
  chunksTotal: 0,
  isPlaying: false,
  currentPosition: 0,
  duration: 0,
  activeChunkIndex: 0,
  error: null,
};

export function useTts(): UseTts {
  const clientRef = useRef<TtsClient | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);
  const speedRef = useRef(1);

  const [state, setState] = useState<TtsState>(IDLE_STATE);

  // Create the TTS client once; dispose on unmount.
  useEffect(() => {
    const client = new TtsClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      queueRef.current?.stop();
    };
  }, []);

  const update = useCallback((patch: Partial<TtsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Sync speedRef so the queue callback always has the latest speed.
  useEffect(() => {
    speedRef.current = state.speed;
  }, [state.speed]);

  const setVoice = useCallback((voiceId: string) => {
    queueRef.current?.stop();
    queueRef.current = null;
    setState((prev) => ({ ...IDLE_STATE, voiceId, speed: prev.speed }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
    // Live speed change: re-seek to current position with the new rate.
    queueRef.current?.setRate(speed);
  }, []);

  const synthesize = useCallback(
    async (text: string, bookId?: string, chunkIds?: string[]) => {
      const client = clientRef.current;
      if (!client) return;

      // Stop any existing playback.
      queueRef.current?.stop();
      queueRef.current = null;

      const chunks = chunkText(text);
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
        activeChunkIndex: 0,
      });

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
              activeChunkIndex: snap.index,
            }));
          },
        });
        queue.setPlan(chunks.length);
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
              update({ status: "synthesizing", downloadProgress: null });
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

                // Auto-play on first chunk arrival (user gesture was the
                // synthesize call, so AudioContext can resume).
                if (!firstChunkPlayed) {
                  firstChunkPlayed = true;
                  void q.play();
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

  const seekToChunk = useCallback((index: number) => {
    queueRef.current?.seekToChunk(index);
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
      activeChunkIndex: 0,
    });
  }, [update]);

  const reset = useCallback(() => {
    clientRef.current?.cancel();
    queueRef.current?.stop();
    queueRef.current = null;
    setState((prev) => ({ ...IDLE_STATE, voiceId: prev.voiceId, speed: prev.speed }));
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
