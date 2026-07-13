import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDriversList } from '@logidash/api-client';
import { useZoneMap } from '../../hooks/useZoneMap';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { DriverToolbar } from './components/DriverToolbar';
import { DriverTable, DriverTableSkeleton } from './components/DriverTable';
import {
  DEFAULT_DRIVER_FILTERS,
  matchesDriverFilters,
  type DriverFilters,
} from './driver-filters';

const PAGE_SIZE = 8;

export function DriversPage() {
  const navigate = useNavigate();
  const { zoneCode } = useZoneMap();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<DriverFilters>(DEFAULT_DRIVER_FILTERS);

  const q = useDriversList({ page, limit: PAGE_SIZE });

  const rows = (q.data?.data ?? []).filter((d) =>
    matchesDriverFilters(d, filters),
  );
  const meta = q.data?.meta;

  function clearFilters() {
    setFilters(DEFAULT_DRIVER_FILTERS);
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-6">
      <DriverToolbar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      <Card className="overflow-hidden">
        {q.isError ? (
          <ErrorState
            body="The drivers service could not be reached."
            onRetry={() => q.refetch()}
          />
        ) : q.isPending ? (
          <DriverTableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="users"
            title="No drivers match"
            body="Try a different search or availability filter."
            action={
              <Button variant="secondary" icon="x" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <DriverTable
              rows={rows}
              zoneCode={zoneCode}
              onOpen={(id) => navigate(`/drivers/${id}`)}
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
    </div>
  );
}
