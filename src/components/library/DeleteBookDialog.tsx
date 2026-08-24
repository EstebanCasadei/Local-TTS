import { Dialog } from "../Dialog.tsx";

type DeleteBookDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DeleteBookDialog({ open, title, onClose, onConfirm }: DeleteBookDialogProps) {
  return (
    <Dialog
      footer={
        <>
          <button
            className="font-p cursor-pointer rounded-[8px] px-4 py-2 text-text-secondary transition duration-150 hover:bg-bg-tertiary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="font-p cursor-pointer rounded-[8px] bg-action-error px-4 py-2 font-bold text-text-inverse transition duration-150 hover:bg-action-error-hover"
            onClick={onConfirm}
            type="button"
          >
            Eliminar
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="¿Eliminar documento?"
    >
      <p className="font-p text-text-primary">
        Se eliminará <span className="font-semibold truncate">{title}</span> y todo su progreso
        guardado. Esta acción no se puede deshacer.
      </p>
    </Dialog>
  );
}
