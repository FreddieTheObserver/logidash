import { NavLink } from 'react-router-dom';
import { useDashboardGetStats, type Role } from '@logidash/api-client';
import { ICONS } from '../ui/icons';
import { NAV, type NavItem } from './nav';

export function Sidebar({ role }: { role: Role }) {
  const items = NAV.filter((n) => n.roles.includes(role));
  const Route = ICONS.route;
  const Sparkles = ICONS.sparkles;

  // Shared with DashboardPage via the query cache — one request feeds both.
  const statsQ = useDashboardGetStats({
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });
  const badgeValue = (badge?: NavItem['badge']): number | null => {
    const s = statsQ.data;
    if (!badge || !s) return null;
    return badge === 'openDeliveries' ? s.deliveries.open : s.drivers.available;
  };

  return (
    <aside
      className="bg-surface flex shrink-0 flex-col border-r"
      style={{ width: 232, borderColor: 'var(--color-border)' }}
    >
      {/* brand */}
      <div
        className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span
          className="flex items-center justify-center rounded-md"
          style={{ width: 28, height: 28, background: 'var(--color-primary)' }}
        >
          <Route size={17} className="text-white" strokeWidth={2} />
        </span>
        <span
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          logidash
        </span>
      </div>

      {/* nav */}
      <nav
        className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-3"
        aria-label="Primary"
      >
        <div
          className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Operations
        </div>
        {items.map((item) => {
          const Cmp = ICONS[item.icon];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                'ring-focus relative flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors ' +
                (isActive ? '' : 'hover:bg-surface-alt')
              }
              style={({ isActive }) => ({
                color: isActive
                  ? 'var(--color-primary)'
                  : 'var(--color-text-muted)',
                background: isActive ? 'var(--tint-primary)' : 'transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  <Cmp size={18} strokeWidth={isActive ? 2 : 1.75} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {badgeValue(item.badge) !== null && (
                    <span
                      className="tnum rounded-full px-1.5 py-0.5 text-center text-[11.5px] font-semibold"
                      style={{
                        minWidth: 20,
                        background: isActive
                          ? 'rgba(37,99,235,.15)'
                          : 'var(--color-surface-alt)',
                        color: isActive
                          ? 'var(--color-primary)'
                          : 'var(--color-text-muted)',
                      }}
                    >
                      {badgeValue(item.badge)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* footer help */}
      <div
        className="shrink-0 border-t p-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="rounded-md p-3"
          style={{ background: 'var(--color-surface-alt)' }}
        >
          <div
            className="flex items-center gap-2 text-[12.5px] font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
            Recommendation engine
          </div>
          <div
            className="mt-1 text-[11.5px] leading-snug"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Drivers ranked 0–100 with a per-factor explanation on every
            delivery.
          </div>
        </div>
      </div>
    </aside>
  );
}
