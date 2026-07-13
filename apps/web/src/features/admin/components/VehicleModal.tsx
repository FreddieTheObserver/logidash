import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useVehiclesCreate,
  useVehiclesUpdate,
  getVehiclesListQueryKey,
  CreateVehicleDtoType,
  CreateVehicleDtoStatus,
} from '@logidash/api-client';
import type { VehicleDto } from '@logidash/api-client';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';
import { mapDetailMessages, type ApiError } from '../../../lib/api-errors';

const TYPES = Object.values(CreateVehicleDtoType);
const STATUSES = Object.values(CreateVehicleDtoStatus);
type TypeValue = (typeof TYPES)[number];
type StatusValue = (typeof STATUSES)[number];

// The DTO fields this form renders inputs for — 400 details route to them.
const VEHICLE_FIELDS = [
  'type',
  'capacityWeight',
  'capacityVolume',
  'status',
] as const;

export function VehicleModal({
  open,
  onClose,
  vehicle,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  vehicle: VehicleDto | null;
  onSaved: (msg: string) => void;
}) {
  return (
    <Modal
      open={open}
      title={vehicle ? `Edit ${vehicle.type}` : 'Add vehicle'}
      onClose={onClose}
    >
      {open && (
        <VehicleForm
          key="form"
          vehicle={vehicle}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function VehicleForm({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: VehicleDto | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const create = useVehiclesCreate();
  const update = useVehiclesUpdate();
  const isPending = create.isPending || update.isPending;

  const [type, setType] = useState<TypeValue>(vehicle?.type ?? TYPES[0]);
  const [capacityWeight, setCapacityWeight] = useState(
    vehicle ? String(vehicle.capacityWeight) : '',
  );
  const [capacityVolume, setCapacityVolume] = useState(
    vehicle ? String(vehicle.capacityVolume) : '',
  );
  const [status, setStatus] = useState<StatusValue>(
    vehicle?.status ?? 'active',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const Alert = ICONS.alert;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const payload = {
      type,
      capacityWeight: Number(capacityWeight),
      capacityVolume: Number(capacityVolume),
      status,
    };
    try {
      if (vehicle) {
        await update.mutateAsync({ id: vehicle.id, data: payload });
      } else {
        await create.mutateAsync({ data: payload });
      }
      void qc.invalidateQueries({ queryKey: getVehiclesListQueryKey() });
      onSaved(vehicle ? 'Vehicle updated.' : 'Vehicle created.');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      const data = e.response?.data;
      if (e.response?.status === 400 && data?.details?.length) {
        const { fields, rest } = mapDetailMessages(
          data.details,
          VEHICLE_FIELDS,
        );
        setErrors(fields);
        if (rest.length > 0) setFormError(rest.join('; '));
      } else {
        setFormError(data?.message ?? 'Could not save the vehicle.');
      }
    }
  }

  return (
    <form
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

        <Field label="Type" error={errors['type']} required>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as TypeValue)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Capacity weight (kg)"
          error={errors['capacityWeight']}
          required
        >
          <Input
            type="number"
            min={0}
            step="0.1"
            value={capacityWeight}
            onChange={(e) => setCapacityWeight(e.target.value)}
            placeholder="0.0"
            invalid={!!errors['capacityWeight']}
          />
        </Field>

        <Field
          label="Capacity volume (m³)"
          error={errors['capacityVolume']}
          required
        >
          <Input
            type="number"
            min={0}
            step="0.1"
            value={capacityVolume}
            onChange={(e) => setCapacityVolume(e.target.value)}
            placeholder="0.0"
            invalid={!!errors['capacityVolume']}
          />
        </Field>

        {vehicle && (
          <Field label="Status" error={errors['status']}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusValue)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Saving…' : vehicle ? 'Save changes' : 'Create vehicle'}
        </Button>
      </div>
    </form>
  );
}
