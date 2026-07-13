import type { DashboardStatsDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Meter } from '../../../components/ui/Meter';
import { TONE, type Tone } from '../../../lib/tone';

const ROWS: {
  key: 'available' | 'busy' | 'offline';
  label: string;
  tone: Tone;
}[] = [
  { key: 'available', label: 'Available', tone: 'success' },
  { key: 'busy', label: 'Busy', tone: 'warning' },
  { key: 'offline', label: 'Offline', tone: 'neutral' },
];

export function DriverAvailabilityCard({
  stats,
  isPending,
}: {
  stats: DashboardStatsDto | undefined;
  isPending: boolean;
}) {
  return (
    <Card className="p-4">
      <h2
        className="text-[13.5px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Driver availability
      </h2>
      <div className="mt-3 space-y-3">
        {isPending || !stats
          ? ROWS.map((r) => <Skeleton key={r.key} h={16} />)
          : ROWS.map((r) => {
              const count = stats.drivers[r.key];
              const share = stats.drivers.total
                ? count / stats.drivers.total
                : 0;
              return (
                <div key={r.key} className="flex items-center gap-3">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: TONE[r.tone].fg }}
                  />
                  <span
                    className="w-16 text-[12.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {r.label}
                  </span>
                  <span className="flex-1">
                    <Meter value={share} tone={r.tone} />
                  </span>
                  <span
                    className="tnum w-6 text-right text-[12.5px] font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
      </div>
    </Card>
  );
}
