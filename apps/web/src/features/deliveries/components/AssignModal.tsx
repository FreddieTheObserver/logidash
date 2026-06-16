import { useState } from 'react';
import { useAssignmentsCreate } from '@logidash/api-client';
import type { RecommendationCandidateDto } from '@logidash/api-client';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';

type ApiError = {
  response?: { status?: number; data?: { message?: string } };
};

export interface AssignModalProps {
  open: boolean;
  deliveryId: string;
  reference: string;
  candidate: RecommendationCandidateDto;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignModal({
  open,
  deliveryId,
  reference,
  candidate,
  onClose,
  onAssigned,
}: AssignModalProps) {
  const { mutateAsync, isPending } = useAssignmentsCreate();
  const [error, setError] = useState<string | null>(null);
  const Alert = ICONS.alert;

  async function confirm() {
    setError(null);
    try {
      await mutateAsync({
        deliveryId,
        data: { driverId: candidate.driverId },
      });
      onAssigned();
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.response?.data?.message ?? 'Could not assign this driver.');
    }
  }

  return (
    <Modal
      open={open}
      title="Confirm assignment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isPending}
            onClick={() => {
              void confirm();
            }}
          >
            Confirm assign
          </Button>
        </>
      }
    >
      <div
        className="space-y-3 text-[13px]"
        style={{ color: 'var(--color-text)' }}
      >
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--color-text-muted)' }}>Delivery</span>
          <span className="font-medium">{reference}</span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--color-text-muted)' }}>Driver</span>
          <span className="font-medium">{candidate.driver.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--color-text-muted)' }}>Vehicle</span>
          <span className="font-medium">
            {candidate.driver.vehicle?.type ?? 'No vehicle'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--color-text-muted)' }}>Score</span>
          <span className="tnum font-medium">
            {candidate.score}
            {candidate.rank != null ? ` · Rank ${candidate.rank}` : ''}
          </span>
        </div>
        <p
          className="text-[12.5px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Eligibility is re-validated on the server and the action is audited.
        </p>

        {error && (
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
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
      </div>
    </Modal>
  );
}
