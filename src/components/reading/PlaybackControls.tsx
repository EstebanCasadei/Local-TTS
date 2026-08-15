type PlaybackControlsProps = {
  isPlaying: boolean;
  speed: number;
  onToggle: () => void;
  onSpeedChange: (speed: number) => void;
};

export function PlaybackControls({
  isPlaying,
  speed,
  onToggle,
  onSpeedChange,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-full bg-action-primary px-4 py-2 text-bg-primary"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <input
        aria-label="Speed"
        max={2}
        min={0.5}
        onChange={(event) => onSpeedChange(Number.parseFloat(event.target.value))}
        step={0.1}
        type="range"
        value={speed}
      />
      <span>{speed.toFixed(1)}x</span>
    </div>
  );
}
