import type { Bookmark } from "../../types/book.ts";
import { formatDuration } from "../../lib/audio.ts";
import PencilIcon from "../../icons/PencilIcon.svg?react";
import PlayIcon from "../../icons/PlayIcon.svg?react";
import TrashIcon from "../../icons/TrashIcon.svg?react";
import { SidePanel } from "./SidePanel.tsx";

export function BookmarksPanel({
  open,
  onClose,
  bookmarks,
  getChunkPreview,
  onPlay,
  onEditNote,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  /** Truncated preview of the chunk text a bookmark points to. */
  getChunkPreview: (chunkId: string) => string;
  onPlay: (bookmark: Bookmark) => void;
  onEditNote: (bookmark: Bookmark) => void;
  onDelete: (bookmarkId: string) => void;
}) {
  return (
    <SidePanel onClose={onClose} open={open} title="Marcadores">
      {bookmarks.length === 0 ? (
        <p className="font-label text-text-secondary">
          Guardá un marcador desde el reproductor para verlo acá.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {[...bookmarks]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((bookmark) => (
              <li className="flex items-center gap-1" key={bookmark.id}>
                <button
                  aria-label="Reproducir desde el marcador"
                  className="grid size-8 mr-2 shrink-0 cursor-pointer place-items-center rounded-full text-text-primary transition duration-150 bg-text-primary hover:bg-text-secondary active:scale-95"
                  onClick={() => onPlay(bookmark)}
                  type="button"
                >
                  <PlayIcon className="size-4 text-text-inverse" />
                </button>
                <span className="min-w-0 flex-1 py-1">
                  <span className="font-p block truncate font-medium">
                    {bookmark.nombre || getChunkPreview(bookmark.chunkId)}
                  </span>
                  <span className="font-label block truncate text-text-secondary">
                    {formatDuration(bookmark.offsetSegundos)}
                    {bookmark.nombre ? ` · ${getChunkPreview(bookmark.chunkId)}` : ""}
                  </span>
                </span>
                <button
                  aria-label="Editar nota del marcador"
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition duration-150 hover:bg-bg-tertiary active:scale-95"
                  onClick={() => onEditNote(bookmark)}
                  type="button"
                >
                  <PencilIcon className="size-4" />
                </button>
                <button
                  aria-label="Eliminar marcador"
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition duration-150 hover:bg-bg-tertiary active:scale-95"
                  onClick={() => onDelete(bookmark.id)}
                  type="button"
                >
                  <TrashIcon className="size-4" />
                </button>
              </li>
            ))}
        </ul>
      )}
    </SidePanel>
  );
}
