import { useCallback, useEffect, useRef, useState } from "react";
import { PlaybackControls } from "../components/reading/PlaybackControls";
import { adjacentSelection, emptyQueue, queueKey, type SelectionQueue } from "./queue";
import { useSelectionPlayback } from "./useSelectionPlayback";
import { voiceIconSrc } from "../lib/voiceIcons";
import BookIcon from "../icons/BookIcon.svg?react";
import CloseIcon from "../icons/CloseIcon.svg?react";
import TrashIcon from "../icons/TrashIcon.svg?react";
import ChevronUpIcon from "../icons/ChevronUpIcon.svg?react";
import CheckCircleFilledIcon from "../icons/CheckCircleFilledIcon.svg?react";
import ShieldIcon from "../icons/ShieldIcon.svg?react";
import PlayIcon from "../icons/PlayIcon.svg?react";
import PauseIcon from "../icons/PauseIcon.svg?react";

const statusLabels = {
  idle: "Listo para escuchar",
  loading: "Preparando audio",
  playing: "Reproduciendo",
  paused: "En pausa",
  buffering: "Preparando el siguiente fragmento",
  done: "Lectura terminada",
  error: "No se pudo reproducir",
};

export function SidePanel() {
  const [queue, setQueue] = useState<SelectionQueue>(emptyQueue);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [follow, setFollow] = useState(() => localStorage.getItem("local-tts:follow") !== "false");
  const [highlighted, setHighlighted] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const port = useRef<chrome.runtime.Port | null>(null);
  const current = useRef<{ id: string | null; index: number }>({ id: null, index: 0 });
  const player = useSelectionPlayback();
  const active = queue.items.find((item) => item.id === queue.activeId);
  const { start, stop } = player;
  const activeRef = useRef(active);
  activeRef.current = active;
  const activeId = active?.id;
  const hasAudio = player.chunksDone > 0;
  const nextId = adjacentSelection(queue, 1)?.id;
  const activeIndex = queue.items.findIndex((item) => item.id === queue.activeId);

  useEffect(() => {
    let disposed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let localPort: chrome.runtime.Port | null = null;
    let listener:
      | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
      | undefined;
    void chrome.windows
      .getCurrent()
      .then(async (window) => {
        if (disposed || window.id == null) return;
        const id = window.id;
        setWindowId(id);
        listener = (changes, area) => {
          if (area === "session" && changes[queueKey(id)])
            setQueue(
              (changes[queueKey(id)].newValue as SelectionQueue | undefined) ?? emptyQueue(),
            );
        };
        chrome.storage.onChanged.addListener(listener);
        const response = await chrome.runtime.sendMessage({ type: "queue:get", windowId: id });
        if (disposed) return;
        if (response.error) throw new Error(response.error);
        setQueue(response.queue);
        localPort = chrome.runtime.connect({ name: "local-tts-panel" });
        port.current = localPort;
        setConnected(true);
        heartbeat = setInterval(() => localPort?.postMessage({ type: "panel:heartbeat" }), 20_000);
        localPort.onMessage.addListener((message) => {
          if (
            message.type === "highlight:result" &&
            message.id === current.current.id &&
            message.index === current.current.index
          )
            setHighlighted(message.highlighted);
        });
        localPort.onDisconnect.addListener(() => {
          if (disposed) return;
          clearInterval(heartbeat);
          setConnected(false);
          setNotice("La conexión con la extensión se cerró. Vuelve a abrir el panel.");
          stop();
        });
      })
      .catch(() => {
        if (!disposed) setNotice("No se pudo abrir la cola. Vuelve a abrir el panel.");
      });
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      if (listener) chrome.storage.onChanged.removeListener(listener);
      localPort?.disconnect();
      port.current = null;
    };
  }, [stop]);

  useEffect(() => {
    const item = activeRef.current;
    if (item) start(item);
    else stop();
    setHighlighted(null);
  }, [activeId, start, stop]);

  const request = useCallback(
    async (type: string, id?: string) => {
      if (windowId == null) return;
      try {
        const response = await chrome.runtime.sendMessage({ type, windowId, id });
        if (response.error) setNotice(response.error);
        else setNotice(null);
      } catch {
        setNotice("No se pudo actualizar la cola. Inténtalo de nuevo.");
      }
    },
    [windowId],
  );

  useEffect(() => {
    if (player.status === "done" && player.itemId === queue.activeId && nextId) {
      void request("queue:activate", nextId);
    }
  }, [player.status, player.itemId, queue.activeId, nextId, request]);

  useEffect(() => {
    current.current = { id: activeId ?? null, index: player.chunkIndex };
    if (!connected || windowId == null) return;
    const shouldHighlight = Boolean(
      activeId &&
      player.itemId === activeId &&
      hasAudio &&
      (player.status === "playing" || player.status === "paused" || player.status === "buffering"),
    );
    port.current?.postMessage({
      windowId,
      id: activeId,
      index: shouldHighlight ? player.chunkIndex : null,
      follow,
    });
  }, [
    activeId,
    player.chunkIndex,
    player.itemId,
    hasAudio,
    player.status,
    follow,
    connected,
    windowId,
  ]);

  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
  }, [settingsOpen]);

  const previous = adjacentSelection(queue, -1);
  const next = adjacentSelection(queue, 1);
  const isPlaying = ["playing", "buffering", "loading"].includes(player.status);
  const visibleNotice = notice ?? queue.notice;
  const activeVoice = player.voices.find((voice) => voice.id === player.voiceId)!;
  const progress = player.duration ? (player.position / player.duration) * 100 : 0;

  return (
    <div className="extension-shell">
      <header className="extension-header">
        <BookIcon className="brand-mark" aria-hidden="true" />
        <h1 className="brand-name">
          <span>Local</span>
          <span>TTS</span>
        </h1>
        <span className="surface-label">Lectura web</span>
      </header>

      <main className="extension-main brand-scrollbar">
        {visibleNotice && (
          <div className="notice" role="alert">
            <span>{visibleNotice}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => {
                setNotice(null);
                void request("queue:notice");
              }}
            >
              ×
            </button>
          </div>
        )}
        {!active ? (
          <section className="empty-state">
            <BookIcon className="empty-mark" aria-hidden="true" />
            <h2>Selecciona un texto</h2>
            <p>Agrega una lectura desde la página que estás visitando.</p>
            <ol>
              <li>Selecciona un texto en una página</li>
              <li>Haz clic derecho sobre la selección</li>
              <li>
                Elige <strong>Escuchar con LocalTTS</strong>
              </li>
            </ol>
            <div className="privacy-note">
              <ShieldIcon aria-hidden="true" />
              <span>
                La voz se genera en tu navegador.
                <br />
                La primera vez se descarga el modelo.
              </span>
            </div>
          </section>
        ) : (
          <>
            <section className="now-playing">
              <div className="reading-meta">
                <span>
                  Lectura {activeIndex + 1} de {queue.items.length}
                </span>
                <img className="reading-voice" src={voiceIconSrc(player.voiceId)} alt="" />
              </div>
              <p className="source-host">{hostname(active.url)}</p>
              <h2>{active.title}</h2>
              <p className="selection-preview">{active.text}</p>
              <div className="playback-status" role="status">
                {isPlaying ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
                {statusLabels[player.status]}
                {player.downloadPercent !== null && player.status === "loading"
                  ? " · " + Math.round(player.downloadPercent) + "%"
                  : ""}
              </div>
              {player.error && (
                <p className="notice" role="alert">
                  {player.error}
                </p>
              )}
              {(!active.highlightAvailable || highlighted === false) && (
                <p className="highlight-note">
                  Puedes seguir escuchando. El resaltado no está disponible en esta página o el
                  texto cambió.
                </p>
              )}
              <label className="follow-toggle">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => {
                    setFollow(event.target.checked);
                    localStorage.setItem("local-tts:follow", String(event.target.checked));
                  }}
                />
                Seguir el fragmento en la página
              </label>
            </section>
            <section className="queue-section" aria-label="Cola de lectura">
              <div className="section-heading">
                <h3>
                  Cola de lectura <span>{queue.items.length}</span>
                </h3>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void request("queue:clear")}
                >
                  Vaciar
                </button>
              </div>
              <p className="queue-hint">
                Agrega más textos con clic derecho. Se reproducen en orden.
              </p>
              <ol className="queue-list">
                {queue.items.map((item, index) => (
                  <li
                    className={item.id === active.id ? "queue-item selected" : "queue-item"}
                    key={item.id}
                  >
                    <button
                      className="queue-select"
                      type="button"
                      aria-label={"Escuchar selección " + (index + 1) + ": " + item.title}
                      aria-current={item.id === active.id ? "true" : undefined}
                      onClick={() => {
                        if (item.id !== active.id) void request("queue:activate", item.id);
                        else if (isPlaying) player.pause();
                        else player.play();
                      }}
                    >
                      <span className="queue-number">
                        {item.id === active.id ? (
                          isPlaying ? (
                            <PauseIcon />
                          ) : (
                            <PlayIcon />
                          )
                        ) : (
                          String(index + 1)
                        )}
                      </span>
                      <span className="queue-copy">
                        <strong>{item.text.replace(/\s+/g, " ")}</strong>
                        <small>{hostname(item.url)}</small>
                      </span>
                    </button>
                    <button
                      className="remove-selection"
                      type="button"
                      aria-label={"Quitar selección " + (index + 1)}
                      onClick={() => {
                        player.forget(item.id);
                        void request("queue:remove", item.id);
                      }}
                    >
                      <TrashIcon aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>

      {active && (
        <footer className="extension-player">
          <div className="queue-navigation">
            <button
              disabled={!previous}
              type="button"
              onClick={() => previous && void request("queue:activate", previous.id)}
            >
              <ChevronUpIcon className="previous-icon" aria-hidden="true" /> Anterior
            </button>
            <span>Lectura {activeIndex + 1}</span>
            <button
              disabled={!next}
              type="button"
              onClick={() => next && void request("queue:activate", next.id)}
            >
              Siguiente <ChevronUpIcon className="next-icon" aria-hidden="true" />
            </button>
          </div>
          <PlaybackControls
            isPlaying={isPlaying}
            speed={player.speed}
            voiceId={player.voiceId}
            voiceName={activeVoice.label}
            position={player.formatPosition}
            duration={player.formatTotal}
            progressPercent={progress}
            onToggle={() => (isPlaying ? player.pause() : player.play())}
            onSpeedChange={player.setSpeed}
            onVolumeChange={player.setVolume}
            volume={player.volume}
            onOpenVoices={() => setSettingsOpen(true)}
            onRewind={player.rewind}
            onForward={player.forward}
            showBookmark={false}
            onSeek={(percent) => player.seek((player.duration * percent) / 100)}
          />
        </footer>
      )}

      {settingsOpen && (
        <dialog
          ref={settingsDialog}
          className="settings-dialog"
          aria-labelledby="voice-settings-title"
          onCancel={() => setSettingsOpen(false)}
        >
          <section className="voice-settings" aria-labelledby="voice-settings-title">
            <div className="section-heading">
              <h2 id="voice-settings-title">Voces</h2>
              <button
                type="button"
                aria-label="Cerrar voces"
                onClick={() => setSettingsOpen(false)}
              >
                <CloseIcon aria-hidden="true" />
              </button>
            </div>
            <p className="queue-hint">Voces en español, guardadas en tu navegador.</p>
            <div className="voice-options">
              {player.voices.map((voice) => (
                <button
                  type="button"
                  key={voice.id}
                  aria-pressed={voice.id === player.voiceId}
                  onClick={() => {
                    player.changeVoice(voice.id);
                    setSettingsOpen(false);
                  }}
                >
                  <img src={voiceIconSrc(voice.id)} alt="" />
                  <span>
                    <strong>{voice.label}</strong>
                    <small>
                      {voice.accent} · {voice.size}
                    </small>
                  </span>
                  {voice.id === player.voiceId && (
                    <CheckCircleFilledIcon className="voice-check" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
            <label className="volume-setting">
              Volumen{" "}
              <input
                aria-label="Volumen"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={player.volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
              />
              <span>{Math.round(player.volume * 100)}%</span>
            </label>
            <button className="settings-close" type="button" onClick={() => setSettingsOpen(false)}>
              Listo
            </button>
          </section>
        </dialog>
      )}
    </div>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Página web";
  }
}
