import { useState } from "react";
import ImportIcon from "../../icons/ImportIcon.svg?react";
import VolumeIcon from "../../icons/VolumeIcon.svg?react";
import type { PanelItem } from "./PanelList.tsx";
import { PanelList, PanelSectionTitle } from "./PanelList.tsx";
import { SidePanel } from "./SidePanel.tsx";

// ponytail: catálogo hardcodeado — las pistas reales llegan con el mixer de audio.
const AMBIENT: PanelItem[] = [
  { id: "white", name: "Ruido blanco", detail: "Local TTS", status: "selected" },
  { id: "brown", name: "Ruido marrón", detail: "Local TTS", status: "download" },
  { id: "pink", name: "Ruido rosa", detail: "Local TTS", status: "download" },
  { id: "rain", name: "Lluvia", detail: "Local TTS", status: "ready" },
  { id: "forest", name: "Bosque", detail: "Local TTS", status: "ready" },
];

const MUSIC: PanelItem[] = [
  { id: "lofi", name: "LoFi Girl - Mixtape", detail: "LoFi Girl", status: "download" },
  { id: "myway", name: "My Way", detail: "Frank Sinatra", status: "download" },
  { id: "other", name: "Other songs", detail: "Artist", status: "download" },
];

export function AudioPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [volume, setVolume] = useState(45);

  return (
    <SidePanel
      footer={
        <>
          <button
            className="font-p mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-border-primary p-2 transition duration-150 hover:bg-bg-tertiary active:scale-95"
            type="button"
          >
            <ImportIcon className="size-4 shrink-0" />
            Importar
          </button>
          <p className="font-h3 mb-2 font-bold">Volúmen</p>
          <label className="flex items-center gap-2">
            <VolumeIcon className="size-5 shrink-0" />
            <span className="sr-only">Volumen del sonido ambiente</span>
            <input
              className="w-full accent-action-primary"
              max={100}
              min={0}
              onChange={(event) => setVolume(Number(event.target.value))}
              type="range"
              value={volume}
            />
          </label>
        </>
      }
      onClose={onClose}
      open={open}
      title="Música/sonido ambiente"
    >
      <PanelSectionTitle>Ambiente</PanelSectionTitle>
      <PanelList items={AMBIENT} />
      <PanelSectionTitle>Música</PanelSectionTitle>
      <PanelList items={MUSIC} />
    </SidePanel>
  );
}
