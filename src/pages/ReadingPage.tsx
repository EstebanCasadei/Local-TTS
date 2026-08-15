import { Aside } from "../components";
import { KaraokeText, PlaybackControls, VoiceSphere } from "../components/reading";
import { usePlayback } from "../hooks/usePlayback.ts";
import type { KaraokeChunk } from "../types/reading.ts";

const EXAMPLE_CHUNKS: KaraokeChunk[] = [
  { text: "Hola ", start: 0, end: 500 },
  { text: "mundo.", start: 500, end: 1000 },
];

export function ReadingPage() {
  const { isPlaying, setSpeed, speed, togglePlay } = usePlayback();

  return (
    <div className="flex min-h-screen">
      <Aside />
      <main className="flex min-w-0 flex-1 flex-col items-center gap-6 p-4 pt-16 text-center md:pt-4">
        <VoiceSphere />
        <KaraokeText activeIndex={0} chunks={EXAMPLE_CHUNKS} />
        <PlaybackControls
          isPlaying={isPlaying}
          onSpeedChange={setSpeed}
          onToggle={togglePlay}
          speed={speed}
        />
      </main>
    </div>
  );
}
