import type { DriverDto } from '@logidash/api-client';
import { AvailabilityChip } from '../../../components/ui/Chip';
import { Avatar } from '../../../components/ui/Avatar';
import { Meter } from '../../../components/ui/Meter';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ICONS } from '../../../components/ui/icons';
import { initials } from '../../../lib/format';
import { workloadTone } from '../driver-filters';

const HEADERS = ['Driver', 'Availability', 'Base zone', 'Vehicle', 'Workload'];

function DriverTableHead() {
  return (
    <thead>
      <tr
        className="sticky top-0 z-10"
        style={{ background: 'var(--color-surface)' }}
      >
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
  );
}

export function DriverTableSkeleton() {
  return (
    <table className="w-full border-collapse" style={{ minWidth: 720 }}>
      <DriverTableHead />
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr
            key={i}
            style={{
              background: i % 2 ? 'var(--color-surface-alt)' : 'transparent',
            }}
          >
            {Array.from({ length: 5 }).map((__, j) => (
              <td key={j} className="h-[46px] px-3">
                <Skeleton w={j === 0 ? 140 : 80} h={j === 1 ? 18 : 12} />
              </td>
            ))}
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DriverTable({
  rows,
  zoneCode,
  onOpen,
}: {
  rows: DriverDto[];
  zoneCode: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const Chevron = ICONS.chevronRight;

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 720 }}>
        <DriverTableHead />
        <tbody>
          {rows.map((row, i) => {
            const zebra = i % 2 ? 'var(--color-surface-alt)' : 'transparent';
            const utilisation = row.maxConcurrentJobs
              ? row.activeJobCount / row.maxConcurrentJobs
              : 0;
            return (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => onOpen(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onOpen(row.id);
                }}
                className="ring-focus group cursor-pointer transition-colors"
                style={{ background: zebra }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--tint-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = zebra;
                }}
              >
                <td className="h-[46px] px-3 whitespace-nowrap">
                  <span className="flex items-center gap-2.5">
                    <Avatar
                      initials={initials(row.name)}
                      name={row.name}
                      id={row.id}
                      size={28}
                    />
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {row.name}
                    </span>
                  </span>
                </td>
                <td className="px-3">
                  <AvailabilityChip value={row.availability} size="sm" />
                </td>
                <td className="px-3 whitespace-nowrap">
                  <span
                    className="text-[12.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {zoneCode(row.baseZoneId)}
                  </span>
                </td>
                <td className="px-3 whitespace-nowrap">
                  <span
                    className="text-[12.5px] capitalize"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {row.vehicle ? row.vehicle.type : '—'}
                  </span>
                </td>
                <td className="px-3">
                  <span className="flex items-center gap-2">
                    <span className="w-20">
                      <Meter
                        value={utilisation}
                        tone={workloadTone(
                          row.activeJobCount,
                          row.maxConcurrentJobs,
                        )}
                      />
                    </span>
                    <span
                      className="tnum text-[12px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {row.activeJobCount}/{row.maxConcurrentJobs}
                    </span>
                  </span>
                </td>
                <td className="px-3 text-right">
                  <Chevron
                    size={15}
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
