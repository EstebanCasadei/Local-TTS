import { useRef } from "react";
import type { AmbientTrack, useAmbientAudio } from "../../hooks/useAmbientAudio.ts";
import ImportIcon from "../../icons/ImportIcon.svg?react";
import PauseIcon from "../../icons/PauseIcon.svg?react";
import PlayIcon from "../../icons/PlayIcon.svg?react";
import TrashIcon from "../../icons/TrashIcon.svg?react";
import VolumeIcon from "../../icons/VolumeIcon.svg?react";
import { PanelSectionTitle } from "./PanelList.tsx";
import { SidePanel } from "./SidePanel.tsx";

/** State + controls come from useAmbientAudio(), lifted to ReadingPage so it
 * can also drive the "está sonando" badge on the menu button. */
export function AudioPanel({
  open,
  onClose,
  ambient: audio,
}: {
  open: boolean;
  onClose: () => void;
  ambient: ReturnType<typeof useAmbientAudio>;
}) {
  const {
    tracks,
    selectedId,
    isPlaying,
    volume,
    loadingId,
    toggle,
    setVolume,
    importTrack,
    removeTrack,
  } = audio;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ambient = tracks.filter((t) => t.kind === "noise");
  const music = tracks.filter((t) => t.kind === "imported");

  return (
    <SidePanel
      footer={
        <>
          <button
            className="font-p mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-border-primary p-2 transition duration-150 hover:bg-bg-tertiary active:scale-95"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <ImportIcon className="size-4 shrink-0" />
            Importar
          </button>
          <input
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importTrack(file);
            }}
            ref={fileInputRef}
            type="file"
          />
          <p className="font-h3 mb-2 font-bold">Volúmen</p>
          <label className="flex items-center gap-2">
            <VolumeIcon className="size-5 shrink-0" />
            <span className="sr-only">Volumen del sonido ambiente</span>
            <input
              className="w-full accent-action-primary"
              max={100}
              min={0}
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
              type="range"
              value={Math.round(volume * 100)}
            />
          </label>
        </>
      }
      onClose={onClose}
      open={open}
      title="Música/sonido ambiente"
    >
      <PanelSectionTitle>Ambiente</PanelSectionTitle>
      <AmbientTrackList
        isPlaying={isPlaying}
        loadingId={loadingId}
        onToggle={toggle}
        selectedId={selectedId}
        tracks={ambient}
      />
      <PanelSectionTitle>Música</PanelSectionTitle>
      {music.length === 0 ? (
        <p className="font-label text-text-secondary">
          Importá una canción para escucharla de fondo mientras leés.
        </p>
      ) : (
        <AmbientTrackList
          isPlaying={isPlaying}
          loadingId={loadingId}
          onRemove={removeTrack}
          onToggle={toggle}
          selectedId={selectedId}
          tracks={music}
        />
      )}
    </SidePanel>
  );
}

function AmbientTrackList({
  tracks,
  selectedId,
  isPlaying,
  loadingId,
  onToggle,
  onRemove,
}: {
  tracks: AmbientTrack[];
  selectedId: string | null;
  isPlaying: boolean;
  loadingId: string | null;
  onToggle: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {tracks.map((track) => {
        const active = track.id === selectedId;
        const playing = active && isPlaying;
        return (
          <li className="flex items-center gap-1" key={track.id}>
            <button
              className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-[8px] p-2 text-left transition duration-150 hover:bg-bg-tertiary active:scale-[0.98] ${
                active ? "bg-action-primary/10" : ""
              }`}
              onClick={() => onToggle(track.id)}
              type="button"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg-tertiary text-text-primary">
                {loadingId === track.id ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
                ) : playing ? (
                  <PauseIcon className="size-4" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`font-p block truncate font-medium ${active ? "text-brand-primary" : ""}`}
                >
                  {track.name}
                </span>
              </span>
            </button>
            {onRemove && (
              <button
                aria-label={`Eliminar ${track.name}`}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition duration-150 hover:bg-bg-tertiary active:scale-95"
                onClick={() => onRemove(track.id)}
                type="button"
              >
                <TrashIcon className="size-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
