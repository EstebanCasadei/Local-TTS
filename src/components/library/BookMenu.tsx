import { useEffect, useRef } from "react";
import CloudUpIcon from "../../icons/CloudUpIcon.svg?react";
import PencilIcon from "../../icons/PencilIcon.svg?react";
import TrashIcon from "../../icons/TrashIcon.svg?react";
import { DotsIcon } from "./shared.tsx";

const ITEMS = [
  { label: "Subir a la nube", icon: CloudUpIcon, hoverClass: "hover:bg-bg-tertiary" },
  { label: "Renombrar", icon: PencilIcon, hoverClass: "hover:bg-bg-tertiary" },
  {
    label: "Eliminar",
    icon: TrashIcon,
    hoverClass: "hover:bg-action-error hover:text-text-inverse",
  },
];

export function BookMenu() {
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

  return (
    <details className="relative shrink-0" ref={ref}>
      <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-text-secondary transition duration-150 hover:bg-bg-tertiary active:scale-95">
        <DotsIcon />
        <span className="sr-only">Acciones del documento</span>
      </summary>
      <ul className="absolute right-0 z-10 mt-1 w-44 rounded-[8px] border border-border-primary bg-bg-secondary p-1 shadow-large">
        {ITEMS.map(({ label, icon: Icon, hoverClass }) => (
          <li key={label}>
            {/* TODO: sin handler todavía — acciones pendientes de definir. */}
            <button
              className={`font-p flex w-full cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-left transition duration-150 active:scale-95 ${hoverClass}`}
              type="button"
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
