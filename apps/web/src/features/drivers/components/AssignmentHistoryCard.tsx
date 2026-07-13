import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAssignmentsListByDriver } from '@logidash/api-client';
import type { AssignmentDtoStatus } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Chip, StatusChip } from '../../../components/ui/Chip';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { fromNow } from '../../../lib/format';
import type { Tone } from '../../../lib/tone';

const PAGE_SIZE = 8;

const ASSIGNMENT_TONE: Record<AssignmentDtoStatus, Tone> = {
  active: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

const HEADERS = ['Reference', 'Delivery', 'Assignment', 'When', 'Note'];

export function AssignmentHistoryCard({ driverId }: { driverId: string }) {
  const [page, setPage] = useState(1);
  const q = useAssignmentsListByDriver(driverId, { page, limit: PAGE_SIZE });
  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  return (
    <Card className="overflow-hidden">
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h2
          className="text-[13.5px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Assignment history
        </h2>
      </div>

      {q.isError ? (
        <ErrorState
          body="Assignment history could not be loaded."
          onRetry={() => void q.refetch()}
        />
      ) : q.isPending ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={28} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No assignments yet"
          body="Deliveries assigned to this driver will appear here."
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
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => (
                  <tr
                    key={a.id}
                    style={{
                      background:
                        i % 2 ? 'var(--color-surface-alt)' : 'transparent',
                    }}
                  >
                    <td className="h-[42px] px-3 whitespace-nowrap">
                      <Link
                        to={`/deliveries/${a.delivery.id}`}
                        className="tnum ring-focus text-[13px] font-medium hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {a.delivery.reference}
                      </Link>
                    </td>
                    <td className="px-3">
                      <StatusChip status={a.delivery.status} size="sm" />
                    </td>
                    <td className="px-3">
                      <Chip tone={ASSIGNMENT_TONE[a.status]} dot size="sm">
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Chip>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className="tnum text-[12.5px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {fromNow(a.assignedAt)}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-3">
                      <span
                        className="block truncate text-[12.5px]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {a.unassignReason ?? '—'}
                      </span>
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
    </Card>
  );
}
