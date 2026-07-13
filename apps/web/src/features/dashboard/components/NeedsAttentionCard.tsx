import { useNavigate } from 'react-router-dom';
import { useDeliveriesList } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Chip, StatusChip, PriorityChip } from '../../../components/ui/Chip';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS } from '../../../components/ui/icons';
import { useZoneMap } from '../../../hooks/useZoneMap';
import { deriveSla, TERMINAL } from '../../../lib/sla';
import { fromNow } from '../../../lib/format';
import { SLA_TONE, TONE } from '../../../lib/tone';

const MAX_ROWS = 6;

export function NeedsAttentionCard() {
  const navigate = useNavigate();
  const { zoneCode } = useZoneMap();
  // No server-side sort/multi-status params (logged gap) — fetch one wide
  // page and derive the queue client-side; fine at demo scale.
  const q = useDeliveriesList({ limit: 100 });

  const Clock = ICONS.clock;
  const Chevron = ICONS.chevronRight;

  const rows = (q.data?.data ?? [])
    .filter((d) => !TERMINAL.has(d.status))
    .sort(
      (a, b) =>
        new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime(),
    )
    .slice(0, MAX_ROWS);

  return (
    <Card className="self-start overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h2
          className="text-[13.5px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Needs attention
        </h2>
        {q.data && <Chip size="sm">{rows.length}</Chip>}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/deliveries')}
        >
          View queue
        </Button>
      </div>

      {q.isError ? (
        <ErrorState
          body="Open deliveries could not be loaded."
          onRetry={() => void q.refetch()}
        />
      ) : q.isPending ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={36} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="check"
          title="All caught up"
          body="No open deliveries right now."
        />
      ) : (
        rows.map((d) => {
          const sla = deriveSla(d.status, d.deadlineAt);
          const tone = sla ? SLA_TONE[sla] : 'info';
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => navigate(`/deliveries/${d.id}`)}
              className="hover:bg-surface-alt ring-focus flex w-full items-center gap-3 border-t px-4 py-2.5 text-left"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{ background: TONE[tone].bg, color: TONE[tone].fg }}
              >
                <Clock size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className="tnum text-[13px] font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {d.reference}
                  </span>
                  <PriorityChip value={d.priority} />
                </span>
                <span
                  className="block truncate text-[12px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {zoneCode(d.zoneId)} · {d.pickupAddress} → {d.dropoffAddress}
                </span>
              </span>
              <span
                className="tnum shrink-0 text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {fromNow(d.deadlineAt)}
              </span>
              <StatusChip status={d.status} />
              <Chevron size={15} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          );
        })
      )}
    </Card>
  );
}
