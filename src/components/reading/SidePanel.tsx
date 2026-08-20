import { useEffect, useRef, type ReactNode } from "react";
import CloseIcon from "../../icons/CloseIcon.svg?react";

type SidePanelProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pinned to the bottom, above the panel edge (volume slider, notes...). */
  footer?: ReactNode;
};

/** Slides in from the right edge; full width on mobile, fixed column on md+. */
export function SidePanel({ title, open, onClose, children, footer }: SidePanelProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (open && ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open, onClose]);

  return (
    <aside
      aria-hidden={!open}
      aria-label={title}
      className={`shadow-large fixed top-2 right-0 bottom-2 z-[1000] flex h-[calc(100%-1rem)] h-[calc(100dvh-1rem)] w-full flex-col border border-r-0 border-border-primary rounded-l-2xl bg-bg-primary transition-transform duration-200 md:w-[19rem] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      inert={!open}
      ref={ref}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-primary p-4">
        <h3 className="font-h3 font-bold">{title}</h3>
        <button
          aria-label={`Cerrar ${title}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-text-primary transition duration-150 hover:bg-bg-tertiary active:scale-95"
          onClick={onClose}
          type="button"
        >
          <CloseIcon className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

      {footer && <div className="border-t border-border-primary p-4">{footer}</div>}
    </aside>
  );
}
