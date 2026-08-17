import { useState } from "react";
import InfoIcon from "../../icons/InfoIcon.svg?react";
import type { PanelItem } from "./PanelList.tsx";
import { PanelList, PanelSectionTitle } from "./PanelList.tsx";
import { SidePanel } from "./SidePanel.tsx";

// ponytail: catálogo hardcodeado — las voces reales llegan con Piper (#10).
// "ready" = descargada pero no activa, "download" = no descargada.
const VOICES: PanelItem[] = [
  {
    id: "claudia-mx",
    name: "Claudia - México",
    detail: "Consumo Alto • Femenina",
    status: "ready",
  },
  { id: "aldo-mx", name: "Aldo - México", detail: "Consumo Medio • Masculino", status: "download" },
  { id: "dave-es", name: "Dave - España", detail: "Consumo Medio • Masculino", status: "download" },
  {
    id: "daniela-ar",
    name: "Daniela - Argentina",
    detail: "Consumo Alto • Femenina",
    status: "ready",
  },
  { id: "carl-es", name: "Carl - España", detail: "Consumo Bajo • Masculino", status: "ready" },
];

export function VoicesPanel({
  open,
  onClose,
  selectedId,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string;
}) {
  const items = VOICES.map((voice) =>
    voice.id === selectedId ? { ...voice, status: "selected" as const } : voice,
  );
  const [tonal, setTonal] = useState(true);

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
      <PanelSectionTitle>Recomendado para tí en Español</PanelSectionTitle>
      <PanelList items={items} />
    </SidePanel>
  );
}
