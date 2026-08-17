import { useEffect, useRef, useState } from "react";
import BookmarkIcon from "../../icons/BookmarkIcon.svg?react";
import ForwardIcon from "../../icons/ForwardIcon.svg?react";
import PauseIcon from "../../icons/PauseIcon.svg?react";
import PlayIcon from "../../icons/PlayIcon.svg?react";
import RewindIcon from "../../icons/RewindIcon.svg?react";
import VolumeIcon from "../../icons/VolumeIcon.svg?react";
import { VoiceSphere } from "./VoiceSphere.tsx";

// ponytail: progreso maquetado — los tiempos reales llegan con el audio (#6).
type PlaybackControlsProps = {
  isPlaying: boolean;
  speed: number;
  voiceName: string;
  position?: string;
  duration?: string;
  progressPercent?: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onOpenVoices: () => void;
};

export function PlaybackControls({
  isPlaying,
  speed,
  voiceName,
  position = "00:00",
  duration = "00:00",
  progressPercent = 0,
  onToggle,
  onSpeedChange,
  onOpenVoices,
}: PlaybackControlsProps) {
  const [volume, setVolume] = useState(45);

  return (
    <div className="flex flex-col gap-3 border-t border-border-primary bg-bg-tertiary px-4 py-3">
      <div className="mx-auto max-w-[1100px] w-full">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-label shrink-0 text-text-primary">{position}</span>
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
          <span className="font-label shrink-0 text-text-primary">{duration}</span>
        </div>

        <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
          <VolumeMenu onChange={setVolume} value={volume} />

          <div className="col-start-1 flex items-center justify-center gap-2 md:col-start-2">
            <SpeedMenu onChange={onSpeedChange} speed={speed} />
            <IconButton label="Retroceder 15 segundos">
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
            <IconButton label="Adelantar 15 segundos">
              <ForwardIcon className="size-5" />
            </IconButton>
            <IconButton label="Guardar marcador">
              <BookmarkIcon className="size-5" />
            </IconButton>
          </div>

          <button
            className="font-p font-bold col-start-1 flex w-fit cursor-pointer items-center gap-2 justify-self-center rounded-full border border-border-primary bg-bg-tertiary py-2 pr-3 pl-2 transition duration-150 hover:bg-bg-primary active:scale-95 md:col-start-3 md:justify-self-end"
            onClick={onOpenVoices}
            type="button"
          >
            <VoiceSphere className="size-6" />
            {voiceName}
          </button>
        </div>
      </div>
    </div>
  );
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

  return (
    <details className="relative" ref={ref}>
      <summary className="font-p w-10 cursor-pointer list-none rounded-[8px] py-1 text-center font-medium transition duration-150 hover:bg-bg-tertiary active:scale-95">
        {speed.toFixed(1)}x
      </summary>
      <div className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-[8px] border border-border-primary bg-bg-secondary p-3 shadow-large">
        <div className="font-p mb-2 flex items-center justify-between">
          <span className="font-medium">Velocidad de lectura</span>
        </div>
        <input
          aria-label="Velocidad de lectura"
          className="w-full accent-action-primary"
          max={2}
          min={0.5}
          onChange={(event) => onChange(Number.parseFloat(event.target.value))}
          step={0.5}
          type="range"
          value={speed}
        />
        <div className="font-label mt-1 flex justify-between text-text-secondary">
          <span>0.5</span>
          <span>1</span>
          <span>1.5</span>
          <span>2</span>
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
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      className={`size-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-primary transition duration-150 hover:bg-bg-tertiary active:scale-95 ${className}`}
      type="button"
    >
      {children}
    </button>
  );
}
