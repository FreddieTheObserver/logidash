import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useZonesCreate,
  useZonesUpdate,
  getZonesListQueryKey,
} from '@logidash/api-client';
import type { ZoneDto } from '@logidash/api-client';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';
import { mapDetailMessages, type ApiError } from '../../../lib/api-errors';

// The DTO fields this form renders inputs for — 400 details route to them.
const ZONE_FIELDS = ['name', 'code', 'centerLat', 'centerLng'] as const;

export function ZoneModal({
  open,
  onClose,
  zone,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  zone: ZoneDto | null;
  onSaved: (msg: string) => void;
}) {
  return (
    <Modal
      open={open}
      title={zone ? `Edit ${zone.code}` : 'Add zone'}
      onClose={onClose}
    >
      {open && (
        <ZoneForm key="form" zone={zone} onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  );
}

function ZoneForm({
  zone,
  onClose,
  onSaved,
}: {
  zone: ZoneDto | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const create = useZonesCreate();
  const update = useZonesUpdate();
  const isPending = create.isPending || update.isPending;

  const [name, setName] = useState(zone?.name ?? '');
  const [code, setCode] = useState(zone?.code ?? '');
  const [centerLat, setCenterLat] = useState(
    zone?.centerLat != null ? String(zone.centerLat) : '',
  );
  const [centerLng, setCenterLng] = useState(
    zone?.centerLng != null ? String(zone.centerLng) : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const Alert = ICONS.alert;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const hasLat = centerLat.trim() !== '';
    const hasLng = centerLng.trim() !== '';
    if (hasLat !== hasLng) {
      setFormError('Provide both center coordinates, or neither.');
      return;
    }
    const center = hasLat
      ? { centerLat: Number(centerLat), centerLng: Number(centerLng) }
      : {};

    try {
      if (zone) {
        await update.mutateAsync({
          id: zone.id,
          data: { name, code, ...center },
        });
      } else {
        await create.mutateAsync({ data: { name, code, ...center } });
      }
      void qc.invalidateQueries({ queryKey: getZonesListQueryKey() });
      onSaved(zone ? 'Zone updated.' : 'Zone created.');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      const data = e.response?.data;
      if (e.response?.status === 400 && data?.details?.length) {
        const { fields, rest } = mapDetailMessages(data.details, ZONE_FIELDS);
        setErrors(fields);
        if (rest.length > 0) setFormError(rest.join('; '));
      } else {
        setFormError(data?.message ?? 'Could not save the zone.');
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

        <Field label="Name" error={errors['name']} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. North District"
            invalid={!!errors['name']}
          />
        </Field>

        <Field label="Code" error={errors['code']} required>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. NORTH"
            invalid={!!errors['code']}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Center latitude" error={errors['centerLat']}>
            <Input
              type="number"
              step="0.000001"
              min={-90}
              max={90}
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value)}
              placeholder="Optional"
              invalid={!!errors['centerLat']}
            />
          </Field>
          <Field label="Center longitude" error={errors['centerLng']}>
            <Input
              type="number"
              step="0.000001"
              min={-180}
              max={180}
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value)}
              placeholder="Optional"
              invalid={!!errors['centerLng']}
            />
          </Field>
        </div>
      </div>

      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Saving…' : zone ? 'Save changes' : 'Create zone'}
        </Button>
      </div>
    </form>
  );
}
