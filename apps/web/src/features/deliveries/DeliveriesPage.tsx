import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeliveriesList } from '@logidash/api-client';
import { useAuth } from '../../app/auth/auth-context';
import { useZoneMap } from '../../hooks/useZoneMap';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  DeliveryToolbar,
  type DeliveryFilters,
} from './components/DeliveryToolbar';
import {
  DeliveryTable,
  DeliveryTableSkeleton,
} from './components/DeliveryTable';
import { NewDeliveryModal } from './components/NewDeliveryModal';
import { DEFAULT_FILTERS, matchesClientFilters } from './delivery-filters';

const PAGE_SIZE = 8;

export function DeliveriesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { zoneMap, zoneCode } = useZoneMap();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<DeliveryFilters>(DEFAULT_FILTERS);
  const [newOpen, setNewOpen] = useState(false);

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.priority !== 'all' ? { priority: filters.priority } : {}),
    ...(filters.zoneId !== 'all' ? { zoneId: filters.zoneId } : {}),
  };
  const q = useDeliveriesList(params);

  const canCreate = user?.role === 'admin' || user?.role === 'dispatcher';
  const canAct = canCreate;

  const rows = (q.data?.data ?? []).filter((d) =>
    matchesClientFilters(d, filters),
  );
  const meta = q.data?.meta;

  function updateFilters(next: DeliveryFilters) {
    if (
      next.status !== filters.status ||
      next.priority !== filters.priority ||
      next.zoneId !== filters.zoneId
    ) {
      setPage(1);
    }
    setFilters(next);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-6">
      <DeliveryToolbar
        filters={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        onNew={() => setNewOpen(true)}
        canCreate={canCreate}
        zones={[...zoneMap.values()]}
      />

      <Card className="overflow-hidden">
        {q.isError ? (
          <ErrorState
            body="The deliveries service could not be reached. Your filters are preserved."
            onRetry={() => q.refetch()}
          />
        ) : q.isPending ? (
          <DeliveryTableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No deliveries match these filters"
            body="Try widening the status or zone filters, or clear them to see the full queue."
            action={
              <Button variant="secondary" icon="x" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <DeliveryTable
              rows={rows}
              zoneCode={zoneCode}
              onOpen={(id) => navigate(`/deliveries/${id}`)}
              onRecommend={(id) => navigate(`/deliveries/${id}`)}
              onCancel={(id) => navigate(`/deliveries/${id}`)}
              canAct={canAct}
            />

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

      <NewDeliveryModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
