import {
  appendSelection,
  emptyQueue,
  queueKey,
  removeSelection,
  MAX_SELECTION_CHARS,
  type SelectionItem,
  type SelectionQueue,
} from "./queue";

const MENU_ID = "local-tts-listen";
const HIGHLIGHT_CSS =
  "::highlight(local-tts-reading) { background-color: #c7d2fe; color: #172554; text-decoration: underline; text-decoration-color: #6366f1; }";

async function initialize() {
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Escuchar con LocalTTS",
    contexts: ["selection"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});
chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

let operations: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = operations.then(task);
  operations = result.catch(() => undefined);
  return result;
}
async function readQueue(windowId: number): Promise<SelectionQueue> {
  const key = queueKey(windowId);
  return (
    ((await chrome.storage.session.get(key))[key] as SelectionQueue | undefined) ?? emptyQueue()
  );
}
async function writeQueue(windowId: number, queue: SelectionQueue) {
  await chrome.storage.session.set({ [queueKey(windowId)]: queue });
}
async function sendToSelection(item: SelectionItem, message: Record<string, unknown>) {
  return chrome.tabs.sendMessage(
    item.tabId,
    message,
    item.documentId ? { documentId: item.documentId } : { frameId: item.frameId },
  );
}
async function release(item: SelectionItem) {
  await sendToSelection(item, { type: "selection:release", id: item.id }).catch(() => undefined);
}
async function enqueue(info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab) {
  const windowId = tab.windowId;
  try {
    const text = info.selectionText ?? "";
    if (!text.trim() || text.length > MAX_SELECTION_CHARS)
      throw new Error("Selecciona un texto de hasta 20.000 caracteres.");
    const item: SelectionItem = {
      id: crypto.randomUUID(),
      text,
      title: tab.title || "Texto seleccionado",
      url: info.frameUrl || info.pageUrl || "",
      tabId: tab.id!,
      frameId: info.frameId ?? 0,
      highlightAvailable: false,
    };
    const queue = await readQueue(windowId);
    // Check limits before retaining DOM ranges.
    appendSelection(queue, item);
    try {
      const target = { tabId: item.tabId, frameIds: [item.frameId] };
      const injected = await chrome.scripting.executeScript({ target, files: ["content.js"] });
      item.documentId = injected[0]?.documentId;
      const captured = await sendToSelection(item, {
        type: "selection:capture",
        id: item.id,
        text,
      });
      item.text = captured.text;
      item.highlightAvailable = captured.highlightAvailable;
      await chrome.scripting.insertCSS({
        target: item.documentId ? { tabId: item.tabId, documentIds: [item.documentId] } : target,
        css: HIGHLIGHT_CSS,
      });
    } catch {
      // Reading remains available when the page cannot expose a DOM selection.
      item.highlightAvailable = false;
    }
    await writeQueue(windowId, appendSelection(queue, item));
  } catch (error) {
    const queue = await readQueue(windowId);
    await writeQueue(windowId, {
      ...queue,
      notice: error instanceof Error ? error.message : "No se pudo agregar el texto.",
    });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  // Chrome requires the panel to open synchronously within this user gesture.
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  void serialize(() => enqueue(info, tab));
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL("")) ||
    !Number.isInteger(message.windowId)
  )
    return;
  const windowId = message.windowId as number;
  void serialize(async () => {
    let queue = await readQueue(windowId);
    switch (message.type) {
      case "queue:get":
        return queue;
      case "queue:activate":
        if (!queue.items.some((item) => item.id === message.id))
          throw new Error("La lectura ya no está en la cola.");
        queue = { ...queue, activeId: message.id, notice: null };
        break;
      case "queue:remove": {
        const item = queue.items.find((entry) => entry.id === message.id);
        if (item) await release(item);
        queue = removeSelection(queue, message.id);
        break;
      }
      case "queue:clear":
        await Promise.all(queue.items.map(release));
        queue = emptyQueue();
        break;
      case "queue:notice":
        queue = { ...queue, notice: null };
        break;
      default:
        throw new Error("Unknown queue message");
    }
    await writeQueue(windowId, queue);
    return queue;
  }).then(
    (queue) => respond({ queue }),
    () => respond({ error: "No se pudo actualizar la cola. Inténtalo de nuevo." }),
  );
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "local-tts-panel" || !port.sender?.url?.startsWith(chrome.runtime.getURL("")))
    return;
  let target: SelectionItem | undefined;
  let closed = false;
  let pending = Promise.resolve();
  port.onMessage.addListener((message) => {
    if (message.type === "panel:heartbeat") return;
    pending = pending
      .then(async () => {
        if (closed) return;
        if (target && (target.id !== message.id || message.index === null)) {
          await sendToSelection(target, { type: "selection:clear" }).catch(() => undefined);
          target = undefined;
        }
        if (
          message.index === null ||
          !Number.isInteger(message.windowId) ||
          !Number.isInteger(message.index)
        )
          return;
        const queue = await readQueue(message.windowId);
        const item = queue.items.find((entry) => entry.id === message.id);
        if (closed || !item || queue.activeId !== item.id) return;
        target = item;
        const result = await sendToSelection(item, {
          type: "selection:highlight",
          id: item.id,
          index: message.index,
          follow: Boolean(message.follow),
        }).catch(() => ({ highlighted: false }));
        if (closed) {
          await sendToSelection(item, { type: "selection:clear" }).catch(() => undefined);
          return;
        }
        port.postMessage({
          type: "highlight:result",
          id: item.id,
          index: message.index,
          highlighted: Boolean(result?.highlighted),
        });
      })
      .catch(() => undefined);
  });
  port.onDisconnect.addListener(() => {
    closed = true;
    if (target) void sendToSelection(target, { type: "selection:clear" }).catch(() => undefined);
  });
});
chrome.windows.onRemoved.addListener((windowId) => {
  void serialize(async () => {
    const queue = await readQueue(windowId);
    await Promise.all(queue.items.map(release));
    await chrome.storage.session.remove(queueKey(windowId));
  });
});
