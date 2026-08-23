import { useState } from "react";
import { Dialog } from "../Dialog.tsx";

type BookmarkNoteDialogProps = {
  open: boolean;
  currentNote: string;
  onClose: () => void;
  onConfirm: (note: string) => void | Promise<void>;
};

/** Same pattern as RenameBookDialog, for editing a bookmark's optional note. */
export function BookmarkNoteDialog({
  open,
  currentNote,
  onClose,
  onConfirm,
}: BookmarkNoteDialogProps) {
  const [note, setNote] = useState(currentNote);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    await onConfirm(note.trim());
    setBusy(false);
    onClose();
  };

  return (
    <Dialog
      footer={
        <>
          <button
            className="font-p cursor-pointer rounded-[8px] px-4 py-2 text-text-secondary transition duration-150 hover:bg-bg-tertiary disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="font-p cursor-pointer rounded-[8px] bg-action-primary px-4 py-2 font-bold text-text-primary transition duration-150 hover:bg-action-primary-hover disabled:opacity-50"
            disabled={busy}
            form="bookmark-note-form"
            type="submit"
          >
            Guardar
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Nota del marcador"
    >
      <form id="bookmark-note-form" onSubmit={handleSubmit}>
        <label className="font-p sr-only" htmlFor="bookmark-note">
          Nota
        </label>
        <textarea
          autoFocus
          className="font-p w-full resize-none rounded-[8px] border border-border-primary bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-action-primary"
          id="bookmark-note"
          onChange={(event) => setNote(event.target.value)}
          placeholder="Agregá una nota para recordar este marcador"
          rows={4}
          value={note}
        />
      </form>
    </Dialog>
  );
}
