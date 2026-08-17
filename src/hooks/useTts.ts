import { useCallback, useEffect, useRef, useState } from "react";
import { TtsClient, VOICES, type DownloadProgress } from "../lib/ttsClient";
import { chunkText } from "../lib/chunker";
import { decodeWav, getAudioContext, formatDuration } from "../lib/audio";

// The synthesis lifecycle states. The UI branches on these to show the right
// feedback (download progress, synthesis progress, playback controls, errors).
export type TtsStatus =
  | "idle" // nothing happening, waiting for user input
  | "downloading-voice" // fetching the Piper voice model (~60MB)
  | "synthesizing" // generating WAV chunks
  | "ready" // all chunks synthesized, ready to play
  | "playing" // audio is playing
  | "paused" // audio is paused
  | "error"; // something went wrong

export interface TtsState {
  status: TtsStatus;
  voiceId: string;
  voices: typeof VOICES;
  // Download progress as 0–1 (null when not downloading).
  downloadProgress: number | null;
  // Synthesis progress: chunks done / total.
  chunksDone: number;
  chunksTotal: number;
  // Playback.
  isPlaying: boolean;
  currentPosition: number; // seconds
  duration: number; // seconds, estimated
  // Per-chunk durations in seconds — so the UI can track which chunk is active
  // based on cumulative real durations, not an even split (chunks vary in length).
  chunkDurations: number[];
  error: string | null;
}

export interface UseTts extends TtsState {
  setVoice: (voiceId: string) => void;
  synthesize: (text: string, bookId?: string, chunkIds?: string[]) => Promise<void>;
  play: () => void;
  pause: () => void;
  cancel: () => void;
  reset: () => void;
  formatPosition: () => string;
  formatTotal: () => string;
}

const IDLE_STATE: TtsState = {
  status: "idle",
  voiceId: VOICES[0].id,
  voices: VOICES,
  downloadProgress: null,
  chunksDone: 0,
  chunksTotal: 0,
  isPlaying: false,
  currentPosition: 0,
  duration: 0,
  chunkDurations: [],
  error: null,
};

export function useTts(): UseTts {
  const clientRef = useRef<TtsClient | null>(null);
  const audioBuffersRef = useRef<AudioBuffer[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartTimeRef = useRef(0); // AudioContext.currentTime when playback started
  const playOffsetRef = useRef(0); // offset into the concatenated buffer (seconds)
  const decodePromisesRef = useRef<Promise<void>[]>([]); // in-flight decodeWav calls

  const [state, setState] = useState<TtsState>(IDLE_STATE);

  // Create the TTS client once; dispose on unmount.
  useEffect(() => {
    const client = new TtsClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      sourceNodeRef.current?.stop();
    };
  }, []);

  const update = useCallback((patch: Partial<TtsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Ref so synthesize can call play() without a circular dependency or an
  // auto-play effect (which would loop when onended sets status back to "ready").
  const playRef = useRef<(() => void) | null>(null);

  const setVoice = useCallback((voiceId: string) => {
    // Reset everything when the voice changes — old audio is a different sample rate.
    sourceNodeRef.current?.stop();
    audioBuffersRef.current = [];
    setState({ ...IDLE_STATE, voiceId });
  }, []);

  const synthesize = useCallback(
    async (text: string, bookId?: string, chunkIds?: string[]) => {
      const client = clientRef.current;
      if (!client) return;

      // Cancel any existing playback.
      sourceNodeRef.current?.stop();

      const chunks = chunkText(text);
      if (chunks.length === 0) {
        update({ status: "error", error: "No hay texto para sintetizar." });
        return;
      }

      // Pre-allocate to the chunk count so onChunk can place by index.
      audioBuffersRef.current = new Array(chunks.length);
      decodePromisesRef.current = [];

      update({
        status: "downloading-voice",
        downloadProgress: null,
        chunksDone: 0,
        chunksTotal: chunks.length,
        error: null,
        isPlaying: false,
        currentPosition: 0,
        duration: 0,
        chunkDurations: [],
      });

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
              // Place each buffer at its correct index — not push. With cached
              // chunks, all WAVs arrive nearly simultaneously, so decodeWav
              // resolves in non-deterministic order. Pushing would scramble the
              // audio (chunk 1 before chunk 0). Using the index guarantees the
              // concatenated buffer plays in the right order.
              const p = decodeWav(wav).then((buffer) => {
                audioBuffersRef.current[index] = buffer;
                const filled = audioBuffersRef.current.filter(Boolean);
                setState((prev) => ({
                  ...prev,
                  chunksDone: filled.length,
                  duration: filled.reduce((acc, b) => acc + b.duration, 0),
                  chunkDurations: filled.map((b) => b.duration),
                }));
              });
              decodePromisesRef.current.push(p);
            },
            onChunkFailed: ({ index, message }) => {
              console.warn(`[useTts] chunk ${index + 1} failed:`, message);
            },
          },
          bookId,
          chunkIds,
        );

        if (result.cancelled) {
          update({ status: "idle" });
          return;
        }

        // If all chunks failed, show an error.
        if (result.ok === 0) {
          update({ status: "error", error: "No se pudo sintetizar ningún fragmento." });
          return;
        }

        update({ status: "ready" });
        // Wait for any in-flight decodeWav promises to finish before playing,
        // so the concatenated buffer includes every chunk.
        await Promise.all(decodePromisesRef.current);
        decodePromisesRef.current = [];
        // Auto-play: call play() directly instead of via an effect, so the
        // onended handler (which also sets "ready") doesn't loop.
        playRef.current?.();
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
    // Filter out holes (failed chunks leave empty slots in the pre-allocated array).
    const buffers = audioBuffersRef.current.filter(Boolean);
    if (buffers.length === 0) return;

    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    // Concatenate all decoded buffers into one AudioBuffer for gapless playback.
    // For the tracer bullet this is fine; #10 (streaming queue) will schedule
    // chunks individually for seek support.
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    const sampleRate = buffers[0].sampleRate;
    const combined = ctx.createBuffer(1, totalLength, sampleRate);
    const channelData = combined.getChannelData(0);
    let offset = 0;
    for (const buf of buffers) {
      channelData.set(buf.getChannelData(0), offset);
      offset += buf.length;
    }

    const source = ctx.createBufferSource();
    source.buffer = combined;
    source.connect(ctx.destination);

    const offsetSeconds = playOffsetRef.current;
    source.start(0, offsetSeconds);
    playStartTimeRef.current = ctx.currentTime - offsetSeconds;
    sourceNodeRef.current = source;

    source.onended = () => {
      // Playback finished naturally.
      if (sourceNodeRef.current === source) {
        playOffsetRef.current = 0;
        sourceNodeRef.current = null;
        update({ status: "ready", isPlaying: false, currentPosition: 0 });
      }
    };

    update({ status: "playing", isPlaying: true });
  }, [update]);

  const pause = useCallback(() => {
    const source = sourceNodeRef.current;
    const ctx = getAudioContext();
    if (!source) return;

    // Calculate how far we've played, then stop.
    const elapsed = ctx.currentTime - playStartTimeRef.current;
    playOffsetRef.current = Math.min(
      elapsed,
      audioBuffersRef.current.reduce((a, b) => a + b.duration, 0),
    );
    source.stop();
    sourceNodeRef.current = null;

    update({ status: "paused", isPlaying: false, currentPosition: playOffsetRef.current });
  }, [update]);

  const cancel = useCallback(() => {
    clientRef.current?.cancel();
    sourceNodeRef.current?.stop();
    sourceNodeRef.current = null;
    audioBuffersRef.current = [];
    playOffsetRef.current = 0;
    update({
      status: "idle",
      chunksDone: 0,
      chunksTotal: 0,
      isPlaying: false,
      currentPosition: 0,
      duration: 0,
      chunkDurations: [],
    });
  }, [update]);

  const reset = useCallback(() => {
    clientRef.current?.cancel();
    sourceNodeRef.current?.stop();
    sourceNodeRef.current = null;
    audioBuffersRef.current = [];
    playOffsetRef.current = 0;
    setState({ ...IDLE_STATE, voiceId: state.voiceId });
  }, [state.voiceId]);

  const formatPosition = useCallback(
    () => formatDuration(state.currentPosition),
    [state.currentPosition],
  );
  const formatTotal = useCallback(() => formatDuration(state.duration), [state.duration]);

  // Track playback position while playing.
  useEffect(() => {
    if (state.status !== "playing") return;
    let rafId: number;
    const tick = () => {
      const ctx = getAudioContext();
      const elapsed = ctx.currentTime - playStartTimeRef.current;
      setState((prev) => ({ ...prev, currentPosition: Math.min(elapsed, prev.duration) }));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state.status]);

  // Keep playRef in sync so synthesize can call play() without a circular dep.
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  return {
    ...state,
    setVoice,
    synthesize,
    play,
    pause,
    cancel,
    reset,
    formatPosition,
    formatTotal,
  };
}
