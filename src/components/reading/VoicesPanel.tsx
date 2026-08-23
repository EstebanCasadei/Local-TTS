import type { Voice } from "../../lib/ttsClient";
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
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
  voices: Voice[];
  downloadedIds: string[];
  downloadingId: string | null;
}) {
  const items: PanelItem[] = voices.map((voice) => {
    const detail = `${voice.accent} · ${voice.size}`;
    if (voice.id === selectedId)
      return { id: voice.id, name: voice.label, detail, status: "selected" as const };
    if (downloadedIds.includes(voice.id)) {
      return { id: voice.id, name: voice.label, detail, status: "ready" as const };
    }
    return { id: voice.id, name: voice.label, detail, status: "download" as const };
  });
  // const [tonal, setTonal] = useState(true);

  return (
    <SidePanel
      footer={
        <>
          <p className="font-label text-center text-text-secondary">
            Las voces se descargan localmente en tu navegador
          </p>
          {/* <p className="font-h3 mb-2 font-bold">Opciones</p>
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
          </label> */}
        </>
      }
      onClose={onClose}
      open={open}
      title="Voces"
    >
      <PanelSectionTitle>Voces disponibles</PanelSectionTitle>
      <PanelList items={items} onSelect={downloadingId ? undefined : onSelect} />
    </SidePanel>
  );
}
