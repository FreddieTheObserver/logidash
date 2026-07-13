import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useZonesList,
  useZonesRemove,
  getZonesListQueryKey,
} from '@logidash/api-client';
import type { ZoneDto } from '@logidash/api-client';
import { Chip } from '../../../components/ui/Chip';
import { Menu, MenuItem } from '../../../components/ui/Menu';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS } from '../../../components/ui/icons';
import type { ApiError } from '../../../lib/api-errors';
import { ZoneModal } from './ZoneModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

export interface AdminTabProps {
  adding: boolean;
  onCloseAdd: () => void;
  onSaved: (msg: string) => void;
}

const PAGE_SIZE = 8;
const HEADERS = ['Zone', 'Code', 'Center'];

export function ZonesTab({ adding, onCloseAdd, onSaved }: AdminTabProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useZonesList({ page, limit: PAGE_SIZE });
  const remove = useZonesRemove();
  const [editing, setEditing] = useState<ZoneDto | null>(null);
  const [deleting, setDeleting] = useState<ZoneDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const MapIcon = ICONS.map;
  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync({ id: deleting.id });
      void qc.invalidateQueries({ queryKey: getZonesListQueryKey() });
      onSaved('Zone deleted.');
      setDeleting(null);
    } catch (err) {
      const e = err as ApiError;
      // 409: referential guard — zones with drivers/deliveries can't go.
      setDeleteError(e.response?.data?.message ?? 'Could not delete the zone.');
    }
  }

  return (
    <>
      {q.isError ? (
        <ErrorState
          body="Zones could not be loaded."
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
          icon="map"
          title="No zones yet"
          body="Add the first operational zone to start dispatching."
        />
      ) : (
        <>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 640 }}>
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
                {rows.map((z, i) => (
                  <tr
                    key={z.id}
                    style={{
                      background:
                        i % 2 ? 'var(--color-surface-alt)' : 'transparent',
                    }}
                  >
                    <td className="h-[46px] px-3 whitespace-nowrap">
                      <span className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-md"
                          style={{
                            background: 'var(--tint-info)',
                            color: 'var(--color-info)',
                          }}
                        >
                          <MapIcon size={15} />
                        </span>
                        <span
                          className="text-[13px] font-medium"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {z.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-3">
                      <Chip size="sm">{z.code}</Chip>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className="tnum text-[12.5px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {z.centerLat != null && z.centerLng != null
                          ? `${z.centerLat}, ${z.centerLng}`
                          : '—'}
                      </span>
                    </td>
                    <td className="px-3 text-right">
                      <Menu
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="more"
                            aria-label={`Actions for ${z.name}`}
                          />
                        }
                      >
                        <MenuItem icon="map" onClick={() => setEditing(z)}>
                          Edit
                        </MenuItem>
                        <MenuItem
                          icon="x"
                          danger
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(z);
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

      <ZoneModal
        open={adding || editing !== null}
        zone={editing}
        onClose={() => {
          onCloseAdd();
          setEditing(null);
        }}
        onSaved={onSaved}
      />

      <ConfirmDeleteModal
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.code}?` : 'Delete zone?'}
        body="Zones referenced by drivers or deliveries cannot be deleted."
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        pending={remove.isPending}
        error={deleteError}
      />
    </>
  );
}
