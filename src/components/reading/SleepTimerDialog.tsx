import type { SleepTimerMode } from "../../hooks/useSleepTimer.ts";
import { formatDuration } from "../../lib/audio.ts";
import { Dialog } from "../Dialog.tsx";

const PRESET_MINUTES = [15, 30, 45, 60];

type SleepTimerDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: SleepTimerMode | null;
  remainingMs: number | null;
  onSelectDuration: (minutes: number) => void;
  onSelectEndOfChapter: () => void;
  onCancel: () => void;
};

export function SleepTimerDialog({
  open,
  onClose,
  mode,
  remainingMs,
  onSelectDuration,
  onSelectEndOfChapter,
  onCancel,
}: SleepTimerDialogProps) {
  const activeLabel =
    mode?.kind === "duration"
      ? `Pausando en ${formatDuration((remainingMs ?? 0) / 1000)}`
      : mode?.kind === "chapter"
        ? "Pausando al final del capítulo"
        : null;

  return (
    <Dialog onClose={onClose} open={open} title="Programar descanso">
      {activeLabel && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-[8px] bg-bg-tertiary px-3 py-2">
          <span className="font-p">{activeLabel}</span>
          <button
            className="font-p cursor-pointer text-action-error underline"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        </div>
      )}

      <p className="font-label mb-2 text-text-secondary">
        Pausá la reproducción automáticamente después de:
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PRESET_MINUTES.map((minutes) => (
          <button
            className="font-p cursor-pointer rounded-[8px] border border-border-primary p-2 text-center transition duration-150 hover:bg-bg-tertiary active:scale-95"
            key={minutes}
            onClick={() => {
              onSelectDuration(minutes);
              onClose();
            }}
            type="button"
          >
            {minutes} min
          </button>
        ))}
      </div>

      <button
        className="font-p mt-2 w-full cursor-pointer rounded-[8px] border border-border-primary p-2 text-center transition duration-150 hover:bg-bg-tertiary active:scale-95"
        onClick={() => {
          onSelectEndOfChapter();
          onClose();
        }}
        type="button"
      >
        Pausar al final del capítulo
      </button>
    </Dialog>
  );
}
