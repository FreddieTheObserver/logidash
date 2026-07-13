import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';

export function ConfirmDeleteModal({
  open,
  title,
  body,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  const Alert = ICONS.alert;
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
        {body}
      </p>
      {error && (
        <div
          className="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
          style={{
            background: 'var(--tint-danger)',
            color: 'var(--color-danger)',
          }}
          role="alert"
        >
          <Alert size={15} />
          {error}
        </div>
      )}
      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  );
}
