import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useVehiclesList,
  useVehiclesRemove,
  getVehiclesListQueryKey,
} from '@logidash/api-client';
import type { VehicleDto } from '@logidash/api-client';
import { Chip } from '../../../components/ui/Chip';
import { Menu, MenuItem } from '../../../components/ui/Menu';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useDriverMap } from '../../../hooks/useDriverMap';
import type { ApiError } from '../../../lib/api-errors';
import type { AdminTabProps } from './ZonesTab';
import { VehicleModal } from './VehicleModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

const PAGE_SIZE = 8;
const HEADERS = ['Type', 'Capacity (kg)', 'Capacity (m³)', 'Status', 'Driver'];

export function VehiclesTab({ adding, onCloseAdd, onSaved }: AdminTabProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useVehiclesList({ page, limit: PAGE_SIZE });
  const remove = useVehiclesRemove();
  const { driverName } = useDriverMap();
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const [deleting, setDeleting] = useState<VehicleDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync({ id: deleting.id });
      void qc.invalidateQueries({ queryKey: getVehiclesListQueryKey() });
      onSaved('Vehicle deleted.');
      setDeleting(null);
    } catch (err) {
      const e = err as ApiError;
      // 409: referenced by assignments.
      setDeleteError(
        e.response?.data?.message ?? 'Could not delete the vehicle.',
      );
    }
  }

  return (
    <>
      {q.isError ? (
        <ErrorState
          body="Vehicles could not be loaded."
          onRetry={() => void q.refetch()}
        />
      ) : q.isPending ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} h={32} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="truck"
          title="No vehicles yet"
          body="Add the first fleet vehicle so drivers can be linked."
        />
      ) : (
        <>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 680 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface)' }}>
                  {HEADERS.map((h) => (
                    <th
                      key={h}
                      className="h-10 border-b px-3 text-left text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase"
                      style={{
                        color: 'var(--color-text-muted)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  <th
                    className="border-b"
                    style={{ borderColor: 'var(--color-border)', width: 44 }}
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((v, i) => (
                  <tr
                    key={v.id}
                    style={{
                      background:
                        i % 2 ? 'var(--color-surface-alt)' : 'transparent',
                    }}
                  >
                    <td className="h-[46px] px-3 whitespace-nowrap">
                      <span
                        className="text-[13px] font-medium capitalize"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {v.type}
                      </span>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className="tnum text-[12.5px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {v.capacityWeight}
                      </span>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className="tnum text-[12.5px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {v.capacityVolume}
                      </span>
                    </td>
                    <td className="px-3">
                      <Chip
                        tone={v.status === 'active' ? 'success' : 'neutral'}
                        dot
                        size="sm"
                      >
                        {v.status === 'active' ? 'Active' : 'Inactive'}
                      </Chip>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className="text-[12.5px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {driverName(v.driverId)}
                      </span>
                    </td>
                    <td className="px-3 text-right">
                      <Menu
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="more"
                            aria-label={`Actions for ${v.type} ${v.id}`}
                          />
                        }
                      >
                        <MenuItem icon="truck" onClick={() => setEditing(v)}>
                          Edit
                        </MenuItem>
                        <MenuItem
                          icon="x"
                          danger
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(v);
                          }}
                        >
                          Delete
                        </MenuItem>
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <div
              className="flex h-12 items-center justify-between border-t px-4"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span
                className="tnum text-[12.5px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Showing{' '}
                <b style={{ color: 'var(--color-text)' }}>
                  {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}–
                  {Math.min(meta.page * meta.limit, meta.total)}
                </b>{' '}
                of {meta.total}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="chevronLeft"
                  disabled={meta.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span
                  className="tnum px-2 text-[12.5px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  iconRight="chevronRight"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(meta.totalPages, p + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <VehicleModal
        open={adding || editing !== null}
        vehicle={editing}
        onClose={() => {
          onCloseAdd();
          setEditing(null);
        }}
        onSaved={onSaved}
      />

      <ConfirmDeleteModal
        open={deleting !== null}
        title="Delete vehicle?"
        body="Vehicles referenced by assignments cannot be deleted."
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        pending={remove.isPending}
        error={deleteError}
      />
    </>
  );
}
