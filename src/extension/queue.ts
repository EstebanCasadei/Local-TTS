export const MAX_SELECTION_CHARS = 20_000;
export const MAX_QUEUE_ITEMS = 30;
export const MAX_QUEUE_CHARS = 120_000;

export interface SelectionItem {
  id: string;
  text: string;
  title: string;
  url: string;
  tabId: number;
  frameId: number;
  documentId?: string;
  highlightAvailable: boolean;
}

export interface SelectionQueue {
  items: SelectionItem[];
  activeId: string | null;
  notice: string | null;
}

export const emptyQueue = (): SelectionQueue => ({ items: [], activeId: null, notice: null });

export function appendSelection(queue: SelectionQueue, item: SelectionItem): SelectionQueue {
  if (!item.text.trim()) throw new Error("Selecciona un texto para escucharlo.");
  if (item.text.length > MAX_SELECTION_CHARS)
    throw new Error("Selecciona un texto de hasta 20.000 caracteres.");
  if (
    queue.items.length >= MAX_QUEUE_ITEMS ||
    queue.items.reduce((sum, entry) => sum + entry.text.length, item.text.length) > MAX_QUEUE_CHARS
  ) {
    throw new Error("La cola está llena. Quita alguna lectura para agregar otra.");
  }
  return { items: [...queue.items, item], activeId: queue.activeId ?? item.id, notice: null };
}

export function removeSelection(queue: SelectionQueue, id: string): SelectionQueue {
  const index = queue.items.findIndex((item) => item.id === id);
  const items = queue.items.filter((item) => item.id !== id);
  return {
    ...queue,
    items,
    activeId:
      queue.activeId === id ? ((items[index] ?? items[index - 1])?.id ?? null) : queue.activeId,
  };
}

export function adjacentSelection(
  queue: SelectionQueue,
  direction: number,
): SelectionItem | undefined {
  const index = queue.items.findIndex((item) => item.id === queue.activeId);
  return index < 0 ? undefined : queue.items[index + direction];
}

export function queueKey(windowId: number): string {
  return "local-tts:selection-queue:" + windowId;
}
