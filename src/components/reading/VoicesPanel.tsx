import type { Voice } from "../../lib/ttsClient";
import type { PanelItem } from "./PanelList.tsx";
import { PanelList, PanelSectionTitle } from "./PanelList.tsx";
import { SidePanel } from "./SidePanel.tsx";
import {
  DEFAULT_NARRATION,
  PERSONALITIES,
  type NarrationOptions,
  type Personality,
} from "../../lib/narration/profiles";
import type { ModelUpdate } from "../../lib/narration/protocol";

export function VoicesPanel({
  open,
  onClose,
  onSelect,
  selectedId,
  voices,
  downloadedIds,
  downloadingId,
  narration = DEFAULT_NARRATION,
  narrationModel = { status: "idle" },
  onNarrationChange,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
  voices: Voice[];
  downloadedIds: string[];
  downloadingId: string | null;
  narration?: NarrationOptions;
  narrationModel?: ModelUpdate;
  onNarrationChange?: (options: NarrationOptions) => void;
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
          <label className="font-p mt-4 flex items-center justify-between gap-2">
            Narración adaptativa
            <input
              type="checkbox"
              checked={narration.enabled}
              onChange={(event) =>
                onNarrationChange?.({ ...narration, enabled: event.target.checked })
              }
            />
          </label>
          {narration.enabled && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="font-p">
                Estilo de lectura
                <select
                  className="ml-2 rounded bg-bg-tertiary p-1"
                  value={narration.personality}
                  onChange={(event) =>
                    onNarrationChange?.({
                      ...narration,
                      personality: event.target.value as Personality,
                    })
                  }
                >
                  {PERSONALITIES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="font-label text-text-secondary">
                Clasificación local opcional: descarga inicial de aproximadamente 338 MB cuando se
                necesita. La lectura continúa con reglas mientras se carga.
              </p>
              <p role="status" className="font-label text-text-secondary">
                {narrationModel.status === "loading"
                  ? `Cargando clasificador${narrationModel.progress != null ? ` (${Math.round(narrationModel.progress)}%)` : "…"}`
                  : narrationModel.status === "ready"
                    ? "Clasificador local disponible"
                    : narrationModel.status === "fallback"
                      ? "Clasificador no disponible: usando reglas locales"
                      : "Reglas locales activas"}
              </p>
            </div>
          )}
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
