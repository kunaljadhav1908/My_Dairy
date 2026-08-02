import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center text-center">
        <div className={`mb-4 rounded-full p-3 ${danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
          <AlertTriangle className={danger ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'} size={28} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-6 flex w-full gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className={danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
