import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDeliveriesCreate,
  CreateDeliveryDtoPackageSize,
  CreateDeliveryDtoPriority,
  getDashboardGetStatsQueryKey,
  getAuditListQueryKey,
} from '@logidash/api-client';
import type { ZoneDto } from '@logidash/api-client';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { useZoneMap } from '../../../hooks/useZoneMap';
import { ICONS } from '../../../components/ui/icons';
import { mapDetailMessages, type ApiError } from '../../../lib/api-errors';

// The DTO fields this form renders inputs for — 400 details route to them.
const DELIVERY_FIELDS = [
  'reference',
  'pickupAddress',
  'dropoffAddress',
  'zoneId',
  'packageType',
  'packageWeight',
  'packageSize',
  'priority',
  'deadlineAt',
] as const;

const PACKAGE_SIZES = Object.values(CreateDeliveryDtoPackageSize);
const PRIORITIES = Object.values(CreateDeliveryDtoPriority);

const DEFAULT_PACKAGE_SIZE = CreateDeliveryDtoPackageSize.medium;
const DEFAULT_PRIORITY = CreateDeliveryDtoPriority.normal;

export interface NewDeliveryModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewDeliveryModal({ open, onClose }: NewDeliveryModalProps) {
  const { zoneMap } = useZoneMap();

  /*
   * Remount DeliveryForm on each open (key changes from false→true) so all
   * controlled state initialises fresh without calling setState inside an effect.
   */
  return (
    <Modal open={open} title="New delivery" onClose={onClose}>
      {open && <DeliveryForm key="form" zoneMap={zoneMap} onClose={onClose} />}
    </Modal>
  );
}

function DeliveryForm({
  onClose,
  zoneMap,
}: {
  onClose: () => void;
  zoneMap: Map<string, ZoneDto>;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useDeliveriesCreate();

  const [reference, setReference] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [packageType, setPackageType] = useState('');
  const [packageWeight, setPackageWeight] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [packageSize, setPackageSize] =
    useState<
      (typeof CreateDeliveryDtoPackageSize)[keyof typeof CreateDeliveryDtoPackageSize]
    >(DEFAULT_PACKAGE_SIZE);
  const [priority, setPriority] =
    useState<
      (typeof CreateDeliveryDtoPriority)[keyof typeof CreateDeliveryDtoPriority]
    >(DEFAULT_PRIORITY);
  const [deadline, setDeadline] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const zones = [...zoneMap.values()];
  const Alert = ICONS.alert;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    try {
      const created = await mutateAsync({
        data: {
          reference,
          pickupAddress,
          dropoffAddress,
          zoneId,
          packageSize,
          packageWeight: Number(packageWeight),
          packageType,
          priority,
          deadlineAt: new Date(deadline).toISOString(),
        },
      });
      // A new delivery moves the dashboard counts + writes an audit row.
      void qc.invalidateQueries({ queryKey: getDashboardGetStatsQueryKey() });
      void qc.invalidateQueries({ queryKey: getAuditListQueryKey() });
      onClose();
      navigate(`/deliveries/${created.id}`);
    } catch (err) {
      const e = err as ApiError;
      const data = e.response?.data;
      if (e.response?.status === 400 && data?.details?.length) {
        const { fields, rest } = mapDetailMessages(
          data.details,
          DELIVERY_FIELDS,
        );
        setErrors(fields);
        if (rest.length > 0) setFormError(rest.join('; '));
      } else {
        setFormError(data?.message ?? 'Could not create the delivery.');
      }
    }
  }

  return (
    <form
      id="new-delivery-form"
      onSubmit={(e) => {
        void submit(e);
      }}
      noValidate
    >
      <div className="space-y-3">
        {formError && (
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
            style={{
              background: 'var(--tint-danger)',
              color: 'var(--color-danger)',
            }}
            role="alert"
          >
            <Alert size={15} />
            {formError}
          </div>
        )}

        <Field label="Reference" error={errors['reference']} required>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. DEL-0042"
            invalid={!!errors['reference']}
          />
        </Field>

        <Field label="Pickup address" error={errors['pickupAddress']} required>
          <Input
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="123 Main St, City"
            invalid={!!errors['pickupAddress']}
          />
        </Field>

        <Field
          label="Dropoff address"
          error={errors['dropoffAddress']}
          required
        >
          <Input
            value={dropoffAddress}
            onChange={(e) => setDropoffAddress(e.target.value)}
            placeholder="456 Elm Ave, City"
            invalid={!!errors['dropoffAddress']}
          />
        </Field>

        <Field label="Zone" error={errors['zoneId']} required>
          <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">Select zone…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} — {z.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Package type" error={errors['packageType']} required>
          <Input
            value={packageType}
            onChange={(e) => setPackageType(e.target.value)}
            placeholder="e.g. documents, fragile"
            invalid={!!errors['packageType']}
          />
        </Field>

        <Field
          label="Package weight (kg)"
          error={errors['packageWeight']}
          required
        >
          <Input
            type="number"
            min={0}
            step="0.1"
            value={packageWeight}
            onChange={(e) => setPackageWeight(e.target.value)}
            placeholder="0.0"
            invalid={!!errors['packageWeight']}
          />
        </Field>

        <Field label="Package size" error={errors['packageSize']} required>
          <Select
            value={packageSize}
            onChange={(e) =>
              setPackageSize(
                e.target
                  .value as (typeof CreateDeliveryDtoPackageSize)[keyof typeof CreateDeliveryDtoPackageSize],
              )
            }
          >
            {PACKAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priority" error={errors['priority']}>
          <Select
            value={priority}
            onChange={(e) =>
              setPriority(
                e.target
                  .value as (typeof CreateDeliveryDtoPriority)[keyof typeof CreateDeliveryDtoPriority],
              )
            }
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Deadline" error={errors['deadlineAt']} required>
          <Input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            invalid={!!errors['deadlineAt']}
          />
        </Field>
      </div>

      {/* Footer row — rendered inside Modal children slot; matched to Modal's footer slot visual style */}
      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create delivery'}
        </Button>
      </div>
    </form>
  );
}
