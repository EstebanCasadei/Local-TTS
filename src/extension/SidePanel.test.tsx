import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyQueue, queueKey, type SelectionItem, type SelectionQueue } from "./queue";
import { SidePanel } from "./SidePanel";

const mock = vi.hoisted(() => ({
  state: {
    itemId: "a" as string | null,
    status: "playing",
    position: 2,
    duration: 10,
    chunkIndex: 0,
    chunksDone: 1,
    voiceId: "voice-a",
    voices: [{ id: "voice-a", label: "A", accent: "España", size: "63 MB" }],
    speed: 1,
    volume: 1,
    downloadPercent: null,
    error: null,
    formatPosition: "00:02",
    formatTotal: "00:10",
  },
  start: vi.fn(),
  stop: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  forget: vi.fn(),
  seek: vi.fn(),
  rewind: vi.fn(),
  forward: vi.fn(),
  setSpeed: vi.fn(),
  setVolume: vi.fn(),
  changeVoice: vi.fn(),
}));
vi.mock("./useSelectionPlayback", () => ({
  useSelectionPlayback: () => ({
    ...mock.state,
    start: mock.start,
    stop: mock.stop,
    play: mock.play,
    pause: mock.pause,
    forget: mock.forget,
    seek: mock.seek,
    rewind: mock.rewind,
    forward: mock.forward,
    setSpeed: mock.setSpeed,
    setVolume: mock.setVolume,
    changeVoice: mock.changeVoice,
  }),
}));
const item = (id: string): SelectionItem => ({
  id,
  text: "Selección " + id,
  title: "Page " + id,
  url: "https://example.com",
  tabId: 1,
  frameId: 0,
  highlightAvailable: true,
});
let queue: SelectionQueue;
let sendMessage: ReturnType<typeof vi.fn>;
let postMessage: ReturnType<typeof vi.fn>;
let storageListener: (changes: Record<string, unknown>, area: string) => void;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mock.state.status = "playing";
  mock.state.itemId = "a";
  queue = { ...emptyQueue(), items: [item("a"), item("b")], activeId: "a" };
  sendMessage = vi.fn(async () => ({ queue }));
  postMessage = vi.fn();
  vi.stubGlobal("chrome", {
    windows: { getCurrent: vi.fn(async () => ({ id: 8 })) },
    storage: {
      onChanged: {
        addListener: (listener: typeof storageListener) => {
          storageListener = listener;
        },
        removeListener: vi.fn(),
      },
    },
    runtime: {
      getURL: (path: string) => "chrome-extension://test/" + path,
      sendMessage,
      connect: () => ({
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        disconnect: vi.fn(),
        postMessage,
      }),
    },
  });
});
async function openPanel() {
  const view = render(<SidePanel />);
  await screen.findByText("Page a", { exact: true });
  await waitFor(() => expect(mock.start).toHaveBeenCalledWith(item("a")));
  return view;
}
function changeQueue(value: SelectionQueue) {
  queue = value;
  act(() => storageListener({ [queueKey(8)]: { newValue: value } }, "session"));
}

describe("extension panel", () => {
  it("appends queue items without restarting playback", async () => {
    await openPanel();
    expect(mock.start).toHaveBeenCalledTimes(1);
    changeQueue({ ...queue, items: [...queue.items, item("c")] });
    expect(screen.getByRole("button", { name: "Quitar selección 3" })).toBeInTheDocument();
    expect(mock.start).toHaveBeenCalledTimes(1);
  });
  it("advances after completion and ignores completion from the previous selection", async () => {
    const view = await openPanel();
    changeQueue({ ...queue, items: [...queue.items, item("c")] });
    mock.state.status = "done";
    view.rerender(<SidePanel />);
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "queue:activate", windowId: 8, id: "b" }),
    );
    sendMessage.mockClear();
    changeQueue({ ...queue, activeId: "b" });
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "queue:activate" }),
    );
    mock.state.itemId = "b";
    view.rerender(<SidePanel />);
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "queue:activate", windowId: 8, id: "c" }),
    );
  });
  it("sends fragment highlights to the source page and makes follow-scroll optional", async () => {
    await openPanel();
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ windowId: 8, id: "a", index: 0, follow: true }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Seguir el fragmento en la página" }));
    expect(postMessage).toHaveBeenLastCalledWith({ windowId: 8, id: "a", index: 0, follow: false });
  });
  it("uses the shared seek control and supports direct queue navigation", async () => {
    await openPanel();
    expect(screen.queryByRole("button", { name: "Guardar marcador" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Posición de la lectura" }), {
      target: { value: "50" },
    });
    expect(mock.seek).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "queue:activate", windowId: 8, id: "b" }),
    );
  });
});
