import CheckCircleFilledIcon from "../../icons/CheckCircleFilledIcon.svg?react";
import CheckCircleIcon from "../../icons/CheckCircleIcon.svg?react";
import CloudDownIcon from "../../icons/CloudDownIcon.svg?react";
import { DEFAULT_VOICE_ICON, voiceIconSrc } from "../../lib/voiceIcons.ts";

/** selected = en uso · ready = descargada · download = hay que descargarla */
export type PanelItemStatus = "selected" | "ready" | "download";

export type PanelItem = {
  id: string;
  name: string;
  detail: string;
  status: PanelItemStatus;
};

const STATUS_ICON = {
  selected: CheckCircleFilledIcon,
  ready: CheckCircleIcon,
  download: CloudDownIcon,
};

const STATUS_LABEL = {
  selected: "En uso",
  ready: "Descargada",
  download: "Descargar",
};

export function PanelList({
  items,
  onSelect,
}: {
  items: PanelItem[];
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const StatusIcon = STATUS_ICON[item.status];
        return (
          <li key={item.id}>
            <button
              className="flex w-full cursor-pointer items-center gap-3 rounded-[8px] p-2 text-left transition duration-150 hover:bg-bg-tertiary active:scale-[0.98]"
              onClick={() => onSelect?.(item.id)}
              type="button"
            >
              <img
                alt=""
                className="size-8 shrink-0 rounded-full bg-bg-tertiary object-cover"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = DEFAULT_VOICE_ICON;
                }}
                src={voiceIconSrc(item.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-p block truncate font-medium">{item.name}</span>
                <span className="font-label block truncate text-text-secondary">{item.detail}</span>
              </span>
              <StatusIcon
                aria-label={STATUS_LABEL[item.status]}
                className={`size-5 shrink-0 ${
                  item.status === "selected" ? "text-brand-primary" : "text-text-secondary"
                }`}
                role="img"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PanelSectionTitle({ children }: { children: string }) {
  return <p className="font-label mt-4 mb-1 text-text-secondary first:mt-0">{children}</p>;
}
