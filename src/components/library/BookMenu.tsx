import { useEffect, useRef } from "react";
import type { FunctionComponent, SVGProps } from "react";
import CloudUpIcon from "../../icons/CloudUpIcon.svg?react";
import PencilIcon from "../../icons/PencilIcon.svg?react";
import TrashIcon from "../../icons/TrashIcon.svg?react";
import { DotsIcon } from "./shared.tsx";

export type MenuItem = {
  label: string;
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
  onSelect?: () => void;
  hoverClass?: string;
  /** Small brand dot next to the row — e.g. "algo sigue activo en segundo plano". */
  badge?: boolean;
};

/** Small brand-colored notification dot, positioned by the parent. */
function Badge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute size-2.5 rounded-full bg-brand-primary ${className}`}
    />
  );
}

const DOCUMENT_ITEMS: MenuItem[] = [
  { label: "Subir a la nube", icon: CloudUpIcon },
  { label: "Renombrar", icon: PencilIcon },
  {
    label: "Eliminar",
    icon: TrashIcon,
    hoverClass: "hover:bg-action-error hover:text-text-inverse",
  },
];

const DEFAULT_TRIGGER =
  "grid size-8 cursor-pointer list-none place-items-center rounded-full border border-border-primary bg-bg-primary text-text-primary transition duration-150 hover:bg-bg-tertiary active:scale-95";

/** `extraItems` sit above the document actions, separated by a divider. */
export function BookMenu({
  extraItems,
  className = DEFAULT_TRIGGER,
  iconClassName = "size-5",
}: {
  extraItems?: MenuItem[];
  className?: string;
  iconClassName?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node) && ref.current.open) {
        ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  const hasBadge = extraItems?.some((item) => item.badge) ?? false;

  return (
    <details className="shrink-0" ref={ref}>
      <summary className={`relative ${className}`}>
        {hasBadge && <Badge className="-top-1 -left-1 z-10" />}
        <DotsIcon className={iconClassName} />
        <span className="sr-only">Acciones del documento</span>
      </summary>
      <ul className="absolute right-0 top-full z-30 mt-2 w-max rounded-[8px] border border-border-primary bg-bg-secondary p-1 shadow-large">
        {extraItems?.map((item) => (
          <MenuRow item={item} key={item.label} onSelected={close} />
        ))}
        {extraItems && extraItems.length > 0 && (
          <li aria-hidden="true" className="my-1 border-t border-border-primary" />
        )}
        {DOCUMENT_ITEMS.map((item) => (
          <MenuRow item={item} key={item.label} onSelected={close} />
        ))}
      </ul>
    </details>
  );
}

function MenuRow({ item, onSelected }: { item: MenuItem; onSelected: () => void }) {
  const { label, icon: Icon, onSelect, hoverClass = "hover:bg-bg-tertiary", badge } = item;
  return (
    <li>
      {/* TODO: los items sin onSelect no tienen acción todavía. */}
      <button
        className={`font-p flex w-full cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-left transition duration-150 active:scale-95 ${hoverClass}`}
        onClick={() => {
          onSelect?.();
          onSelected();
        }}
        type="button"
      >
        <span className="relative shrink-0">
          <Icon className="size-4 shrink-0" />
          {badge && <Badge className="-top-0.5 -left-0.5" />}
        </span>
        {label}
      </button>
    </li>
  );
}
