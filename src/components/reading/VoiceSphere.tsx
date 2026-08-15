export function VoiceSphere() {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      className="h-32 w-32 rounded-full object-cover"
      aria-label="Voice visualization"
    >
      <track kind="captions" />
    </video>
  );
}
