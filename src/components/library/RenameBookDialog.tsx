import { useState } from "react";
import { Dialog } from "../Dialog.tsx";

type RenameBookDialogProps = {
  open: boolean;
  currentTitle: string;
  onClose: () => void;
  onConfirm: (title: string) => void | Promise<void>;
};

export function RenameBookDialog({
  open,
  currentTitle,
  onClose,
  onConfirm,
}: RenameBookDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || trimmed === currentTitle.trim()) {
      onClose();
      return;
    }
    setBusy(true);
    await onConfirm(trimmed);
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
            type="submit"
            form="rename-book-form"
          >
            Guardar
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Renombrar documento"
    >
      <form id="rename-book-form" onSubmit={handleSubmit}>
        <label className="font-p sr-only" htmlFor="rename-book-title">
          Nuevo título
        </label>
        <input
          autoFocus
          className="font-p w-full rounded-[8px] border border-border-primary bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-action-primary"
          id="rename-book-title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Título del documento"
          type="text"
          value={title}
        />
      </form>
    </Dialog>
  );
}
