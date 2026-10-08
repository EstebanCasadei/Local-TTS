import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyQueue, queueKey, type SelectionItem } from "./queue";

function event() {
  return { addListener: vi.fn() };
}
let api: ReturnType<typeof chromeMock>;
function chromeMock() {
  const values: Record<string, unknown> = {};
  return {
    values,
    runtime: {
      id: "test",
      getURL: (path: string) => "chrome-extension://test/" + path,
      onInstalled: event(),
      onStartup: event(),
      onMessage: event(),
      onConnect: event(),
    },
    contextMenus: { removeAll: vi.fn(async () => {}), create: vi.fn(), onClicked: event() },
    sidePanel: { open: vi.fn(async () => {}), setPanelBehavior: vi.fn(async () => {}) },
    scripting: {
      executeScript: vi.fn(async () => [{ documentId: "document-1" }]),
      insertCSS: vi.fn(async () => {}),
    },
    storage: {
      session: {
        setAccessLevel: vi.fn(async () => {}),
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (entries: Record<string, unknown>) => {
          Object.assign(values, entries);
        }),
        remove: vi.fn(async (key: string) => {
          delete values[key];
        }),
      },
    },
    tabs: {
      sendMessage: vi.fn(async (_tabId: number, message: Record<string, unknown>) =>
        message.type === "selection:capture"
          ? { text: "Hola.", highlightAvailable: true }
          : { highlighted: true },
      ),
    },
    windows: { onRemoved: event() },
  };
}
beforeEach(async () => {
  vi.resetModules();
  api = chromeMock();
  vi.stubGlobal("chrome", api);
  await import("./background");
});
describe("extension background", () => {
  it("opens the side panel in the click gesture before asynchronous capture", async () => {
    const listener = api.contextMenus.onClicked.addListener.mock.calls[0][0];
    listener(
      {
        menuItemId: "local-tts-listen",
        selectionText: "Hola.",
        frameId: 2,
        pageUrl: "https://example.com",
      },
      { id: 5, windowId: 8, title: "Article" },
    );
    expect(api.sidePanel.open).toHaveBeenCalledWith({ windowId: 8 });
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(api.storage.session.set).toHaveBeenCalled());
    const queue = api.values[queueKey(8)] as { items: SelectionItem[] };
    expect(queue.items[0]).toMatchObject({
      text: "Hola.",
      frameId: 2,
      documentId: "document-1",
      highlightAvailable: true,
    });
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ type: "selection:capture" }),
      { documentId: "document-1" },
    );
  });
  it("keeps reading available when the page blocks script injection", async () => {
    api.scripting.executeScript.mockRejectedValueOnce(new Error("Cannot access frame"));
    api.contextMenus.onClicked.addListener.mock.calls[0][0](
      {
        menuItemId: "local-tts-listen",
        selectionText: "Fallback.",
        pageUrl: "https://example.com",
      },
      { id: 5, windowId: 8 },
    );
    await vi.waitFor(() => expect(api.storage.session.set).toHaveBeenCalled());
    expect((api.values[queueKey(8)] as { items: SelectionItem[] }).items[0]).toMatchObject({
      text: "Fallback.",
      highlightAvailable: false,
    });
  });
  it("serializes concurrent additions and preserves the active selection", async () => {
    const click = api.contextMenus.onClicked.addListener.mock.calls[0][0];
    click({ menuItemId: "local-tts-listen", selectionText: "Hola." }, { id: 5, windowId: 8 });
    click({ menuItemId: "local-tts-listen", selectionText: "Hola." }, { id: 6, windowId: 8 });
    await vi.waitFor(() => expect(api.storage.session.set).toHaveBeenCalledTimes(2));
    const queue = api.values[queueKey(8)] as { items: SelectionItem[]; activeId: string };
    expect(queue.items).toHaveLength(2);
    expect(queue.activeId).toBe(queue.items[0].id);
  });
  it("rejects queue commands from page content scripts", () => {
    const respond = vi.fn();
    const result = api.runtime.onMessage.addListener.mock.calls[0][0](
      { type: "queue:clear", windowId: 8 },
      { id: "test", url: "https://example.com" },
      respond,
    );
    expect(result).toBeUndefined();
    expect(respond).not.toHaveBeenCalled();
  });
  it("clears the page highlight when the panel disconnects", async () => {
    const item: SelectionItem = {
      id: "a",
      text: "Hola.",
      title: "Page",
      url: "https://example.com",
      tabId: 5,
      frameId: 0,
      documentId: "old-document",
      highlightAvailable: true,
    };
    api.values[queueKey(8)] = { ...emptyQueue(), items: [item], activeId: item.id };
    const port = {
      name: "local-tts-panel",
      sender: { url: "chrome-extension://test/extension/sidepanel.html" },
      onMessage: event(),
      onDisconnect: event(),
      postMessage: vi.fn(),
    };
    api.runtime.onConnect.addListener.mock.calls[0][0](port);
    port.onMessage.addListener.mock.calls[0][0]({ windowId: 8, id: "a", index: 0 });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalled());
    port.onDisconnect.addListener.mock.calls[0][0]();
    expect(api.tabs.sendMessage).toHaveBeenLastCalledWith(
      5,
      { type: "selection:clear" },
      { documentId: "old-document" },
    );
  });
});
