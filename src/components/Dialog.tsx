import { useEffect, useRef } from "react";
import CloseIcon from "../icons/CloseIcon.svg?react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Modal simple con overlay oscuro, cierre con Escape, click fuera o la X. */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm overflow-hidden rounded-[16px] border border-border-primary bg-bg-secondary shadow-large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-primary px-5 py-4">
          <h2 className="font-h3 font-bold" id="dialog-title">
            {title}
          </h2>
          <button
            aria-label="Cerrar"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-text-primary transition duration-150 hover:bg-bg-tertiary active:scale-95"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border-primary px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
