import { useState } from "react";
import type { Voice } from "../../lib/ttsClient";
import InfoIcon from "../../icons/InfoIcon.svg?react";
import type { PanelItem } from "./PanelList.tsx";
import { PanelList, PanelSectionTitle } from "./PanelList.tsx";
import { SidePanel } from "./SidePanel.tsx";

export function VoicesPanel({
  open,
  onClose,
  onSelect,
  selectedId,
  voices,
  downloadedIds,
  downloadingId,
  downloadProgress,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
  voices: Voice[];
  downloadedIds: string[];
  downloadingId: string | null;
  downloadProgress: number | null;
}) {
  const items: PanelItem[] = voices.map((voice) => {
    if (voice.id === selectedId)
      return { id: voice.id, name: voice.label, detail: voice.accent, status: "selected" as const };
    if (downloadedIds.includes(voice.id)) {
      return { id: voice.id, name: voice.label, detail: voice.accent, status: "ready" as const };
    }
    return { id: voice.id, name: voice.label, detail: voice.accent, status: "download" as const };
  });
  const [tonal, setTonal] = useState(true);

  const progressText =
    downloadingId && downloadProgress != null ? `${Math.round(downloadProgress * 100)}%` : null;

  return (
    <SidePanel
      footer={
        <>
          <p className="font-label mb-4 text-center text-text-secondary">
            Las voces se descargan localmente en tu navegador
          </p>
          <p className="font-h3 mb-2 font-bold">Opciones</p>
          <label className="font-p flex cursor-pointer items-center gap-2">
            <InfoIcon className="size-4 shrink-0 text-text-secondary" />
            <span className="flex-1">Activar variación tonal</span>
            <input
              checked={tonal}
              className="peer sr-only"
              onChange={(event) => setTonal(event.target.checked)}
              type="checkbox"
            />
            <span className="relative h-5 w-9 shrink-0 rounded-full bg-bg-tertiary transition-colors peer-checked:bg-action-primary after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-text-primary after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </>
      }
      onClose={onClose}
      open={open}
      title="Voces"
    >
      {downloadingId && (
        <p className="font-label mb-2 text-text-secondary">
          {progressText ? `Descargando voz… ${progressText}` : "Conectando…"}
        </p>
      )}
      <PanelSectionTitle>Voces disponibles</PanelSectionTitle>
      <PanelList items={items} onSelect={downloadingId ? undefined : onSelect} />
    </SidePanel>
  );
}
