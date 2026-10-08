import { useEffect, useRef } from "react";
import BookmarkIcon from "../../icons/BookmarkIcon.svg?react";
import ForwardIcon from "../../icons/ForwardIcon.svg?react";
import PauseIcon from "../../icons/PauseIcon.svg?react";
import PlayIcon from "../../icons/PlayIcon.svg?react";
import RewindIcon from "../../icons/RewindIcon.svg?react";
import VolumeIcon from "../../icons/VolumeIcon.svg?react";
import { DEFAULT_VOICE_ICON, voiceIconSrc } from "../../lib/voiceIcons.ts";

// ponytail: progreso maquetado — los tiempos reales llegan con el audio (#6).
type PlaybackControlsProps = {
  isPlaying: boolean;
  speed: number;
  voiceId: string;
  voiceName: string;
  position?: string;
  duration?: string;
  progressPercent?: number;
  volume?: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange?: (volume: number) => void;
  onOpenVoices: () => void;
  onRewind?: () => void;
  onForward?: () => void;
  onBookmark?: () => void;
  showBookmark?: boolean;
  onSeek?: (percent: number) => void;
};

export function PlaybackControls({
  isPlaying,
  speed,
  voiceId,
  voiceName,
  position = "00:00",
  duration = "00:00",
  progressPercent = 0,
  volume = 1,
  onToggle,
  onSpeedChange,
  onVolumeChange,
  onOpenVoices,
  onRewind,
  onForward,
  onBookmark,
  showBookmark = true,
  onSeek,
}: PlaybackControlsProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border-primary bg-bg-tertiary px-4 py-3">
      <div className="mx-auto max-w-[1100px] w-full">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-label shrink-0 text-text-primary">{position}</span>
          {onSeek ? (
            <input
              aria-label="Posición de la lectura"
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand-primary"
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={Math.max(0, Math.min(100, progressPercent))}
              onChange={(event) => onSeek(Number(event.target.value))}
            />
          ) : (
            <div
              aria-label="Progreso de la lectura"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progressPercent}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-black"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-action-primary"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          <span className="font-label shrink-0 text-text-primary">{duration}</span>
        </div>

        <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
          <VolumeMenu
            onChange={(v) => onVolumeChange?.(v / 100)}
            value={Math.round(volume * 100)}
          />

          <div className="col-start-1 flex items-center justify-center gap-2 md:col-start-2">
            <SpeedMenu onChange={onSpeedChange} speed={speed} />
            <IconButton label="Retroceder 15 segundos" onClick={onRewind}>
              <RewindIcon className="size-5" />
            </IconButton>
            <button
              aria-label={isPlaying ? "Pausar" : "Reproducir"}
              className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-text-primary text-bg-primary transition duration-150 hover:bg-text-primary-hover active:scale-95"
              onClick={onToggle}
              type="button"
            >
              {isPlaying ? <PauseIcon className="size-6" /> : <PlayIcon className="size-6" />}
            </button>
            <IconButton label="Adelantar 15 segundos" onClick={onForward}>
              <ForwardIcon className="size-5" />
            </IconButton>
            {showBookmark && (
              <IconButton label="Guardar marcador" onClick={onBookmark}>
                <BookmarkIcon className="size-5" />
              </IconButton>
            )}
          </div>

          <button
            className="font-p font-bold col-start-1 flex w-fit cursor-pointer items-center gap-2 justify-self-center rounded-full border border-border-primary bg-bg-tertiary py-2 pr-3 pl-2 transition duration-150 hover:bg-bg-primary active:scale-95 md:col-start-3 md:justify-self-end"
            onClick={onOpenVoices}
            type="button"
          >
            <img
              alt=""
              className="size-6 shrink-0 rounded-full bg-bg-tertiary object-cover"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = DEFAULT_VOICE_ICON;
              }}
              src={voiceIconSrc(voiceId)}
            />
            {voiceName}
          </button>
        </div>
      </div>
    </div>
  );
}

// Speeds aren't evenly spaced (0.25 steps up to 1.5x, then a 0.5 jump to 2x),
// so the picker is index-based over this list rather than a plain numeric
// range input.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function speedLabel(speed: number): string {
  return Number.isInteger(speed) ? `${speed}` : speed.toFixed(2).replace(/0$/, "");
}

/** Dropdown que se abre hacia arriba con un slider de velocidades fijas. */
function SpeedMenu({ speed, onChange }: { speed: number; onChange: (speed: number) => void }) {
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

  // Snap to the closest allowed speed in case a stale/out-of-set value (e.g.
  // an older saved preference) ever makes it here.
  const activeIndex = SPEEDS.reduce(
    (closest, s, i) => (Math.abs(s - speed) < Math.abs(SPEEDS[closest] - speed) ? i : closest),
    0,
  );

  return (
    <details className="relative" ref={ref}>
      <summary className="font-p w-10 cursor-pointer list-none rounded-[8px] py-1 text-center font-medium transition duration-150 hover:bg-bg-tertiary active:scale-95">
        {speedLabel(SPEEDS[activeIndex])}x
      </summary>
      <div className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-[8px] border border-border-primary bg-bg-secondary p-3 shadow-large">
        <div className="font-p mb-2 flex items-center justify-between">
          <span className="font-medium">Velocidad de lectura</span>
        </div>
        <input
          aria-label="Velocidad de lectura"
          className="w-full accent-action-primary"
          max={SPEEDS.length - 1}
          min={0}
          onChange={(event) => onChange(SPEEDS[Number.parseInt(event.target.value, 10)])}
          step={1}
          type="range"
          value={activeIndex}
        />
        <div className="font-label mt-1 flex justify-between text-text-secondary">
          {SPEEDS.map((s) => (
            <span key={s}>{speedLabel(s)}</span>
          ))}
        </div>
      </div>
    </details>
  );
}

/** Dropdown que se abre hacia arriba con un slider de volumen. */
function VolumeMenu({ value, onChange }: { value: number; onChange: (value: number) => void }) {
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
    <details className="relative hidden md:block md:col-start-1" ref={ref}>
      <summary className="grid size-9 shrink-0 cursor-pointer list-none place-items-center rounded-full text-text-primary transition duration-150 hover:bg-bg-tertiary active:scale-95">
        <VolumeIcon className="size-5" />
        <span className="sr-only">Volumen</span>
      </summary>
      <div className="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-[8px] border border-border-primary bg-bg-secondary p-3 shadow-large">
        <div className="font-p mb-2 font-medium">Volumen</div>
        <div className="font-p flex items-center gap-2">
          <VolumeIcon className="size-4 shrink-0" />
          <input
            aria-label="Volumen"
            className="w-full accent-action-primary"
            max={100}
            min={0}
            onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
            step={1}
            type="range"
            value={value}
          />
          <span className="w-8 text-right font-medium">{value}</span>
        </div>
      </div>
    </details>
  );
}

function IconButton({
  children,
  label,
  className = "grid",
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`size-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-primary transition duration-150 hover:bg-bg-tertiary active:scale-95 ${className}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
