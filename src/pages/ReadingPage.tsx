import { useState } from "react";
import type { MenuItem } from "../components/library/BookMenu.tsx";
import { BookMenu } from "../components/library";
import {
  AudioPanel,
  KaraokeText,
  PlaybackControls,
  ReadingHeader,
  VoiceSphere,
  VoicesPanel,
} from "../components/reading";
import { usePlayback } from "../hooks/usePlayback.ts";
import BookmarkIcon from "../icons/BookmarkIcon.svg?react";
import ChevronUpIcon from "../icons/ChevronUpIcon.svg?react";
import MusicIcon from "../icons/MusicIcon.svg?react";
import SleepIcon from "../icons/SleepIcon.svg?react";
import type { KaraokeChunk } from "../types/reading.ts";

// ponytail: todo el contenido es placeholder hasta que existan la extracción
// (#7/#8/#9) y el audio (#6).
const BOOK = {
  title: "AI Design - Test book",
  format: "PDF",
  estimate: "Est. 12 min",
};
const CHAPTER = "The Future of AI Design";
const VOICE = { id: "daniela-ar", name: "Daniela" };

const EXAMPLE_CHUNKS: KaraokeChunk[] = [
  {
    text: "Consider the concept of the ‘Semantic Shell’. ",
    start: 0,
    end: 500,
  },
  {
    text: "A rigid structure, a fixed map demanding the user to learn its cartography. In an AI-driven context, the shell becomes fluid. It understands intent. If a user is immersed in a complex analytical task, the system intelligently suppresses global navigation, minimizing cognitive load and prioritizing the immediate canvas. ",
    start: 500,
    end: 1000,
  },
  {
    text: "Furthermore, the aesthetics of AI tooling must evolve. For too long, powerful tools have been burdened by cluttered, utilitarian interfaces. The next generation demands a synthesis of high performance and executive polish. We must embrace deep, multidimensional surfaces—utilizing precise tonal layering and structural minimalism—to create environments that foster focus and clarity during prolonged, intensive sessions.",
    start: 1000,
    end: 1500,
  },
];

/** Alto de la pestaña con la flecha: es lo único que asoma con el panel cerrado. */
const HANDLE_HEIGHT = "2.25rem";

const MENU_BUTTON =
  "grid size-10 cursor-pointer list-none place-items-center rounded-full shadow-large bg-bg-secondary text-text-primary border border-border-primary transition duration-150 hover:bg-bg-tertiary active:scale-95";

export function ReadingPage() {
  const { isPlaying, setSpeed, speed, togglePlay } = usePlayback();
  const [panel, setPanel] = useState<"voices" | "audio" | null>(null);
  const [expanded, setExpanded] = useState(false);

  const menuItems: MenuItem[] = [
    { label: "Marcadores", icon: BookmarkIcon },
    {
      label: "Música/sonido ambiente",
      icon: MusicIcon,
      onSelect: () => setPanel("audio"),
    },
    { label: "Programar descanso", icon: SleepIcon },
  ];

  return (
    <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-bg-tertiary">
      {/* Menú fijo, visible incluso cuando sube el panel de texto. */}
      <div className="fixed top-4 right-4 z-50">
        <BookMenu className={MENU_BUTTON} extraItems={menuItems} iconClassName="size-6" />
      </div>

      {/* Escenario: título + esfera detrás; el panel de texto sube y los tapa. */}
      <div className="relative min-h-[26rem] flex-1 overflow-hidden">
        <div className="absolute inset-0 flex flex-col p-4 pt-16 md:p-8 md:pt-8">
          <ReadingHeader {...BOOK} />
          <div className="grid flex-1 place-items-center py-4">
            <VoiceSphere />
          </div>
        </div>

        <div
          className="absolute inset-0 flex flex-col transition-transform duration-300 ease-out"
          style={{
            transform: expanded ? undefined : `translateY(calc(100% - ${HANDLE_HEIGHT}))`,
          }}
        >
          <button
            aria-expanded={expanded}
            aria-label={expanded ? "Ocultar el texto" : "Mostrar el texto"}
            className="grid shrink-0 cursor-pointer place-items-center border-t border-border-primary bg-bg-primary text-text-primary transition duration-150 hover:bg-bg-secondary"
            onClick={() => setExpanded((prev) => !prev)}
            style={{ height: HANDLE_HEIGHT }}
            type="button"
          >
            <ChevronUpIcon
              className={`size-5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          <section
            className="flex min-h-0 flex-1 flex-col gap-4 bg-bg-primary p-4 md:p-8"
            inert={!expanded}
          >
            <div className="mx-auto max-w-[1100px] w-full">
              <ReadingHeader {...BOOK} chapter={CHAPTER} showChapter={expanded} />

              <div className="min-h-0 flex-1 overflow-y-auto mt-4">
                <KaraokeText activeIndex={0} chunks={EXAMPLE_CHUNKS} />
              </div>
            </div>
          </section>
        </div>
      </div>

      <PlaybackControls
        isPlaying={isPlaying}
        onOpenVoices={() => setPanel("voices")}
        onSpeedChange={setSpeed}
        onToggle={togglePlay}
        speed={speed}
        voiceName={VOICE.name}
      />

      <VoicesPanel onClose={() => setPanel(null)} open={panel === "voices"} selectedId={VOICE.id} />
      <AudioPanel onClose={() => setPanel(null)} open={panel === "audio"} />
    </main>
  );
}
