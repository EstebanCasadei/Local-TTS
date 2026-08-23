import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import CloseIcon from "../icons/CloseIcon.svg?react";

type ToastOptions = {
  /** Reusa un toast existente (p.ej. para actualizar el progreso de una descarga) en vez de apilar uno nuevo. */
  id?: string;
  dismissible?: boolean;
};

type ToastItem = { id: string; content: ReactNode; dismissible: boolean };

type ToastContextValue = {
  /** Muestra (o actualiza, si `options.id` ya existe) un toast con el contenido dado. Devuelve el id. */
  show: (content: ReactNode, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

/** Envuelve la app (ver Layout.tsx): las notificaciones sobreviven a la navegación entre páginas. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((content: ReactNode, options?: ToastOptions) => {
    const id = options?.id ?? `toast-${nextId++}`;
    const dismissible = options?.dismissible ?? true;
    setToasts((prev) => {
      if (prev.some((t) => t.id === id)) {
        return prev.map((t) => (t.id === id ? { ...t, content } : t));
      }
      return [...prev, { id, content, dismissible }];
    });
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[1000] flex w-[calc(100%-2rem)] max-w-sm flex-col-reverse gap-2">
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            onDismiss={toast.dismissible ? () => dismiss(toast.id) : undefined}
          >
            {toast.content}
          </ToastCard>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Da acceso a `show`/`dismiss` desde cualquier componente dentro de ToastProvider. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

/** Tarjeta genérica: entra deslizándose desde la derecha; el contenido es un slot libre (children). */
function ToastCard({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`shadow-large flex items-start gap-3 rounded-2xl border border-border-primary bg-bg-primary p-4 transition-transform duration-200 ease-out ${
        entered ? "translate-x-0" : "translate-x-[120%]"
      }`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          aria-label="Cerrar notificación"
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition duration-150 hover:bg-bg-tertiary active:scale-95"
          onClick={onDismiss}
          type="button"
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Contenido reutilizable para notificaciones de progreso (0-100), p.ej. descarga de un modelo de voz. */
export function ToastProgress({
  title,
  detail,
  percent,
}: {
  title: string;
  detail?: string;
  percent: number | null;
}) {
  return (
    <div>
      <p className="font-p font-medium">{title}</p>
      {detail && <p className="font-label truncate text-text-secondary">{detail}</p>}
      <div
        aria-label={title}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent ?? undefined}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-black"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-action-primary transition-[width] duration-200"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <p className="font-label mt-1 text-text-secondary">
        {percent != null ? `${Math.round(percent)}%` : "Conectando…"}
      </p>
    </div>
  );
}
