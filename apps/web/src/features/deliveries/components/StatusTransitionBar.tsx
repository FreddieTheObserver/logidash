import { useState } from 'react';
import type { DeliveryDto, DeliveryDtoStatus } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  Chip,
  StatusChip,
  PriorityChip,
  SlaChip,
} from '../../../components/ui/Chip';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input } from '../../../components/ui/Field';
import { ICONS } from '../../../components/ui/icons';
import { fromNow } from '../../../lib/format';
import { deriveSla } from '../../../lib/sla';
import { allowedTransitions } from '../../../lib/delivery-transitions';
import { TRANSITION_LABEL } from '../status-transition-labels';
import { useAuth } from '../../../app/auth/auth-context';

const REASON_REQUIRED: ReadonlySet<DeliveryDtoStatus> = new Set([
  'cancelled',
  'failed',
]);

export function StatusTransitionBar({
  delivery,
  zoneCode,
  isOwnActiveAssignment,
  onChangeStatus,
  pending,
  error,
}: {
  delivery: DeliveryDto;
  zoneCode: (id: string) => string;
  isOwnActiveAssignment: boolean;
  onChangeStatus: (to: DeliveryDtoStatus, reason?: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const { user } = useAuth();
  const [reasonPrompt, setReasonPrompt] = useState<DeliveryDtoStatus | null>(
    null,
  );
  const [reason, setReason] = useState('');

  const Package = ICONS.package;
  const Clock = ICONS.clock;
  const Eye = ICONS.eye;

  const sla = deriveSla(delivery.status, delivery.deadlineAt);
  const transitions = user
    ? allowedTransitions(delivery.status, user.role, isOwnActiveAssignment)
    : [];

  function handleClick(to: DeliveryDtoStatus) {
    if (REASON_REQUIRED.has(to)) {
      setReason('');
      setReasonPrompt(to);
      return;
    }
    onChangeStatus(to);
  }

  function confirmReason() {
    if (!reasonPrompt) return;
    onChangeStatus(reasonPrompt, reason || undefined);
    setReasonPrompt(null);
  }

  return (
    <>
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center rounded-md"
              style={{
                width: 38,
                height: 38,
                background: 'var(--tint-primary)',
                color: 'var(--color-primary)',
              }}
            >
              <Package size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="tnum text-[18px] font-semibold tracking-tight"
                  style={{ color: 'var(--color-text)' }}
                >
                  {delivery.reference}
                </h1>
                <StatusChip status={delivery.status} />
                <PriorityChip value={delivery.priority} />
              </div>
              <div
                className="mt-0.5 text-[12.5px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {zoneCode(delivery.zoneId)} · created{' '}
                {fromNow(delivery.createdAt)}
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {sla !== null && (
            <div
              className="flex items-center gap-2 rounded-md px-3 py-1.5"
              style={{ background: 'var(--color-surface-alt)' }}
            >
              <Clock size={15} style={{ color: 'var(--color-text-muted)' }} />
              <span
                className="text-[12.5px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Deadline
              </span>
              <span
                className="tnum text-[13px] font-medium"
                style={{
                  color:
                    sla === 'breached'
                      ? 'var(--color-danger)'
                      : 'var(--color-text)',
                }}
              >
                {fromNow(delivery.deadlineAt)}
              </span>
              <SlaChip iso={delivery.deadlineAt} size="sm" />
            </div>
          )}

          {transitions.length > 0 && (
            <div className="flex items-center gap-2">
              {transitions.map((to) => {
                const danger = to === 'cancelled' || to === 'failed';
                // `ready` is the unassign edge (assigned→ready) — secondary, not
                // a forward CTA — so it's intentionally excluded from `fwd`.
                const fwd = ['picked_up', 'in_transit', 'delivered'].includes(
                  to,
                );
                return (
                  <Button
                    key={to}
                    size="md"
                    variant={danger ? 'danger' : fwd ? 'primary' : 'secondary'}
                    icon={
                      to === 'delivered'
                        ? 'check'
                        : to === 'cancelled'
                          ? 'x'
                          : to === 'failed'
                            ? 'alert'
                            : undefined
                    }
                    disabled={pending}
                    onClick={() => handleClick(to)}
                  >
                    {TRANSITION_LABEL[to]}
                  </Button>
                );
              })}
            </div>
          )}

          {user?.role === 'viewer' && (
            <Chip tone="neutral">
              <Eye size={12} />
              Read-only
            </Chip>
          )}
        </div>

        {error && (
          <div
            className="border-t px-4 py-2 text-[12.5px]"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-danger)',
            }}
          >
            {error}
          </div>
        )}
      </Card>

      <Modal
        open={reasonPrompt !== null}
        title={reasonPrompt === 'cancelled' ? 'Cancel delivery' : 'Mark failed'}
        onClose={() => setReasonPrompt(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonPrompt(null)}>
              Back
            </Button>
            <Button variant="danger" onClick={confirmReason} disabled={pending}>
              Confirm
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="Optional, recorded in the audit log.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. customer unreachable"
          />
        </Field>
      </Modal>
    </>
  );
}
