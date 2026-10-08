import { captureSelection, normalizeSelection, rangeText } from "./selectionRanges";
import { chunkText } from "../lib/chunker";
import { MAX_QUEUE_ITEMS } from "./queue";

const HIGHLIGHT_NAME = "local-tts-reading";

interface HighlightRegistry {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}
const api = globalThis as unknown as {
  Highlight?: new (...ranges: Range[]) => unknown;
  CSS?: { highlights?: HighlightRegistry };
  __localTtsContentLoaded?: boolean;
};

if (!api.__localTtsContentLoaded) {
  api.__localTtsContentLoaded = true;
  const selections = new Map<string, { ranges: (Range | null)[]; chunks: string[] }>();
  let activeId: string | null = null;
  const clear = () => {
    api.CSS?.highlights?.delete(HIGHLIGHT_NAME);
    activeId = null;
  };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL("")))
      return;
    if (
      message.type === "selection:capture" &&
      typeof message.id === "string" &&
      typeof message.text === "string"
    ) {
      const captured = captureSelection(message.text);
      if (captured) {
        if (selections.size >= MAX_QUEUE_ITEMS) selections.delete(selections.keys().next().value!);
        selections.set(message.id, { ranges: captured.ranges, chunks: chunkText(captured.text) });
      }
      respond({
        text: captured?.text ?? message.text,
        highlightAvailable: Boolean(
          captured && captured.ranges.every(Boolean) && api.Highlight && api.CSS?.highlights,
        ),
      });
    } else if (message.type === "selection:highlight") {
      clear();
      const selection = selections.get(message.id);
      const range = selection?.ranges[message.index];
      if (
        !range ||
        !range.startContainer.isConnected ||
        !range.endContainer.isConnected ||
        normalizeSelection(rangeText(range)) !==
          normalizeSelection(selection!.chunks[message.index]) ||
        !api.Highlight ||
        !api.CSS?.highlights
      ) {
        respond({ highlighted: false });
        return;
      }
      api.CSS.highlights.set(HIGHLIGHT_NAME, new api.Highlight(range));
      activeId = message.id;
      if (message.follow) {
        const rect = range.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight)
          range.startContainer.parentElement?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
      }
      respond({ highlighted: true });
    } else if (message.type === "selection:clear") {
      clear();
      respond({ ok: true });
    } else if (message.type === "selection:release") {
      selections.delete(message.id);
      if (activeId === message.id) clear();
      respond({ ok: true });
    }
  });
  window.addEventListener("pagehide", () => {
    clear();
    selections.clear();
  });
}
