import type { DeliveryDto } from '@logidash/api-client';
import { StatusChip, PriorityChip, SlaChip } from '../../../components/ui/Chip';
import { Avatar } from '../../../components/ui/Avatar';
import { Menu, MenuItem } from '../../../components/ui/Menu';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ICONS } from '../../../components/ui/icons';
import { fromNow } from '../../../lib/format';
import { deriveSla, TERMINAL } from '../../../lib/sla';

const HEADERS = [
  'Reference',
  'Status',
  'Priority',
  'Zone',
  'Route',
  'Package',
  'SLA',
  'Deadline',
  'Driver',
];

function driverInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function DeliveryTableSkeleton() {
  return (
    <table className="w-full border-collapse" style={{ minWidth: 920 }}>
      <DeliveryTableHead />
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr
            key={i}
            style={{
              background: i % 2 ? 'var(--color-surface-alt)' : 'transparent',
            }}
          >
            {Array.from({ length: 9 }).map((__, j) => (
              <td key={j} className="h-[46px] px-3">
                <Skeleton
                  w={j === 4 ? '80%' : j === 0 ? 66 : 60}
                  h={j === 1 || j === 6 ? 18 : 12}
                />
              </td>
            ))}
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeliveryTableHead() {
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
              textAlign: h === 'Deadline' ? 'right' : 'left',
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

export function DeliveryTable({
  rows,
  zoneCode,
  onOpen,
  onRecommend,
  onCancel,
  canAct,
}: {
  rows: DeliveryDto[];
  zoneCode: (id: string) => string;
  onOpen: (id: string) => void;
  onRecommend: (id: string) => void;
  onCancel: (id: string) => void;
  canAct: boolean;
}) {
  const MoreH = ICONS.more;

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 920 }}>
        <DeliveryTableHead />
        <tbody>
          {rows.map((row, i) => {
            const sla = deriveSla(row.status, row.deadlineAt);
            // deriveSla already returns null for terminal statuses, so a
            // 'breached' result is inherently non-terminal.
            const breached = sla === 'breached';
            const zebra = i % 2 ? 'var(--color-surface-alt)' : 'transparent';
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
                  <span
                    className="tnum text-[13px] font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {row.reference}
                  </span>
                </td>
                <td className="px-3">
                  <StatusChip status={row.status} size="sm" />
                </td>
                <td className="px-3">
                  <PriorityChip value={row.priority} size="sm" />
                </td>
                <td className="px-3 whitespace-nowrap">
                  <span
                    className="text-[12.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {zoneCode(row.zoneId)}
                  </span>
                </td>
                <td className="max-w-[200px] px-3">
                  <span
                    className="block truncate text-[12.5px]"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {row.pickupAddress}{' '}
                    <span style={{ color: 'var(--color-text-muted)' }}>→</span>{' '}
                    {row.dropoffAddress}
                  </span>
                </td>
                <td className="px-3 whitespace-nowrap">
                  <span
                    className="text-[12.5px] capitalize"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {row.packageSize} ·{' '}
                    <span className="tnum">{row.packageWeight}kg</span>
                  </span>
                </td>
                <td className="px-3">
                  {sla === null ? (
                    <span
                      className="text-[12px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      —
                    </span>
                  ) : (
                    <SlaChip iso={row.deadlineAt} size="sm" />
                  )}
                </td>
                <td className="px-3 text-right whitespace-nowrap">
                  <span
                    className="tnum text-[12.5px]"
                    style={{
                      color: breached
                        ? 'var(--color-danger)'
                        : 'var(--color-text-muted)',
                    }}
                  >
                    {fromNow(row.deadlineAt)}
                  </span>
                </td>
                <td className="px-3 whitespace-nowrap">
                  {row.assignedDriver ? (
                    <span className="flex items-center gap-1.5">
                      <Avatar
                        initials={driverInitials(row.assignedDriver.name)}
                        name={row.assignedDriver.name}
                        id={row.assignedDriver.id}
                        size={22}
                      />
                      <span
                        className="text-[12.5px]"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {row.assignedDriver.name.split(' ')[0]}
                      </span>
                    </span>
                  ) : (
                    <span
                      className="text-[12px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                  <Menu
                    trigger={
                      <button
                        className="ring-focus flex items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface"
                        style={{
                          width: 28,
                          height: 28,
                          color: 'var(--color-text-muted)',
                        }}
                        aria-label="Row actions"
                      >
                        <MoreH size={16} />
                      </button>
                    }
                  >
                    <MenuItem icon="eye" onClick={() => onOpen(row.id)}>
                      Open
                    </MenuItem>
                    {canAct && row.status === 'ready' && (
                      <MenuItem
                        icon="sparkles"
                        onClick={() => onRecommend(row.id)}
                      >
                        Recommend
                      </MenuItem>
                    )}
                    {canAct && !TERMINAL.has(row.status) && (
                      <MenuItem
                        icon="x"
                        danger
                        onClick={() => onCancel(row.id)}
                      >
                        Cancel
                      </MenuItem>
                    )}
                  </Menu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
