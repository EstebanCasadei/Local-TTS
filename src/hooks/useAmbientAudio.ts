import { useCallback, useEffect, useRef, useState } from "react";
import { NOISE_TRACKS, noiseTrackUrl, type NoiseColor } from "../lib/ambientAudio";
import {
  listAmbientTracks,
  readAmbientTrack,
  removeAmbientTrack,
  saveAmbientTrack,
} from "../lib/ambientStore";

export type AmbientTrack = { id: string; name: string; kind: "noise" | "imported" };

const VOLUME_STORAGE_KEY = "local-tts:ambient-volume";

function loadSavedVolume(): number {
  const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
  if (!saved) return 0.45;
  const volume = Number.parseFloat(saved);
  return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.45;
}

const NOISE_ITEMS: AmbientTrack[] = NOISE_TRACKS.map((t) => ({ ...t, kind: "noise" as const }));

/**
 * Background music/ambient sound player, independent from TTS playback: a
 * single <audio> element plays either generated noise (ambientAudio.ts) or a
 * user-imported file (ambientStore.ts, persisted in OPFS), looping. Switching
 * tracks just reassigns `src` — only one plays at a time.
 */
export function useAmbientAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current) audioRef.current = new Audio();
  // Revoked and replaced whenever an imported track loads — noise track URLs
  // are memoized/reused (see noiseTrackUrl) and must NOT be revoked here.
  const importedUrlRef = useRef<string | null>(null);

  const [tracks, setTracks] = useState<AmbientTrack[]>(NOISE_ITEMS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(loadSavedVolume);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current!;
    audio.loop = true;
    audio.volume = volume;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      if (importedUrlRef.current) URL.revokeObjectURL(importedUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listAmbientTracks().then((imported) => {
      if (imported.length === 0) return;
      setTracks([...NOISE_ITEMS, ...imported.map((t) => ({ ...t, kind: "imported" as const }))]);
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    audioRef.current!.volume = clamped;
  }, []);

  const pause = useCallback(() => {
    audioRef.current!.pause();
  }, []);

  const play = useCallback(
    async (id: string) => {
      const audio = audioRef.current!;
      if (id === selectedId) {
        await audio.play().catch(() => {});
        return;
      }
      const track = tracks.find((t) => t.id === id);
      if (!track) return;

      setLoadingId(id);
      try {
        let src: string;
        if (track.kind === "noise") {
          src = noiseTrackUrl(track.id as NoiseColor);
        } else {
          const buf = await readAmbientTrack(track.id);
          src = URL.createObjectURL(new Blob([buf]));
        }
        if (importedUrlRef.current) URL.revokeObjectURL(importedUrlRef.current);
        importedUrlRef.current = track.kind === "imported" ? src : null;

        audio.pause();
        audio.src = src;
        setSelectedId(id);
        await audio.play().catch(() => {});
      } finally {
        setLoadingId((prev) => (prev === id ? null : prev));
      }
    },
    [tracks, selectedId],
  );

  const toggle = useCallback(
    (id: string) => {
      if (id === selectedId && isPlaying) pause();
      else void play(id);
    },
    [selectedId, isPlaying, pause, play],
  );

  const importTrack = useCallback(async (file: File) => {
    const track = await saveAmbientTrack(file);
    setTracks((prev) => [...prev.filter((t) => t.id !== track.id), { ...track, kind: "imported" }]);
  }, []);

  const removeTrack = useCallback(
    async (id: string) => {
      if (id === selectedId) {
        pause();
        setSelectedId(null);
      }
      await removeAmbientTrack(id);
      setTracks((prev) => prev.filter((t) => t.id !== id));
    },
    [selectedId, pause],
  );

  return {
    tracks,
    selectedId,
    isPlaying,
    volume,
    loadingId,
    play,
    pause,
    toggle,
    setVolume,
    importTrack,
    removeTrack,
  };
}
