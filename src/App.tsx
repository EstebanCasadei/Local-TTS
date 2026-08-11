import { useRef, useEffect, useState } from "react";
import gsap from "gsap";

function App() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!boxRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        boxRef.current,
        { opacity: 0, y: 20, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power2.out" },
      );
    });
    setAnimated(true);
    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div
        ref={boxRef}
        className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-lg max-w-md text-center"
      >
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Local-TTS</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Generador de voz para contenido en español que corre completamente en local.
        </p>
        <div className="mt-4 flex gap-2 justify-center text-sm">
          <span className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            Tailwind v4
          </span>
          <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            GSAP {animated ? "✓" : "…"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
