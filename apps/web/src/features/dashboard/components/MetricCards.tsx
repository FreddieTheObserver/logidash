import type { DashboardStatsDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { TONE, type Tone } from '../../../lib/tone';

interface Metric {
  key: string;
  label: string;
  sub: string;
  icon: IconName;
  tone: Tone;
  value: (s: DashboardStatsDto) => string;
}

const METRICS: Metric[] = [
  {
    key: 'pending',
    label: 'Pending deliveries',
    sub: 'ready for assignment',
    icon: 'inbox',
    tone: 'info',
    value: (s) => String(s.deliveries.ready),
  },
  {
    key: 'active',
    label: 'Active assignments',
    sub: 'assigned · picked up · in transit',
    icon: 'route',
    tone: 'primary',
    value: (s) => String(s.deliveries.active),
  },
  {
    key: 'sla',
    label: 'SLA risk',
    sub: 'at-risk or breached',
    icon: 'alert',
    tone: 'warning',
    value: (s) => String(s.deliveries.atRisk + s.deliveries.breached),
  },
  {
    key: 'drivers',
    label: 'Drivers available',
    sub: 'of the whole fleet',
    icon: 'users',
    tone: 'success',
    value: (s) => `${s.drivers.available}/${s.drivers.total}`,
  },
];

export function MetricCards({
  stats,
  isPending,
}: {
  stats: DashboardStatsDto | undefined;
  isPending: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {METRICS.map((m) => {
        const Icon = ICONS[m.icon];
        const t = TONE[m.tone];
        return (
          <Card key={m.key} className="p-4">
            <span
              className="flex items-center justify-center rounded-md"
              style={{ width: 34, height: 34, background: t.bg, color: t.fg }}
            >
              <Icon size={18} />
            </span>
            {isPending || !stats ? (
              <span className="mt-3 block space-y-2">
                <Skeleton w={64} h={28} />
                <Skeleton w={96} h={12} />
              </span>
            ) : (
              <>
                <div
                  className="tnum mt-3 text-[28px] font-semibold leading-none"
                  style={{ color: 'var(--color-text)' }}
                >
                  {m.value(stats)}
                </div>
                <div
                  className="mt-1 text-[12.5px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {m.label}
                </div>
                <div
                  className="text-[11.5px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {m.sub}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
