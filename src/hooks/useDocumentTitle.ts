import { useEffect } from "react";

/** Sets `document.title` for the page it's used in. Each page passes its own label. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} - Local TTS` : "Local TTS";
  }, [title]);
}
