import type { AuthUserDto } from '@logidash/api-client';
import { Chip } from '../ui/Chip';
import { Avatar } from '../ui/Avatar';
import { Menu, MenuItem } from '../ui/Menu';
import { ICONS } from '../ui/icons';
import { useAuth } from '../../app/auth/auth-context';
import { ROLE_LABEL } from './nav';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const ENV_LABEL = (import.meta.env.VITE_ENV as string | undefined) ?? 'Staging';

export function TopBar({
  title,
  subtitle,
  user,
}: {
  title: string;
  subtitle?: string;
  user: AuthUserDto;
}) {
  const { signOut } = useAuth();
  const Bell = ICONS.bell;
  const Shield = ICONS.shield;
  const ChevronDown = ICONS.chevronDown;

  return (
    <header
      className="bg-surface flex h-14 shrink-0 items-center gap-4 border-b px-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h1
            className="truncate text-[16px] font-semibold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <span
              className="truncate text-[12.5px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <Chip tone="warning" size="sm">
        <ICONS.layers size={12} /> {ENV_LABEL}
      </Chip>

      {/* read-only role display (server-issued JWT — not switchable client-side) */}
      <span
        className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12.5px] font-medium"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        <Shield size={14} /> Viewing as:{' '}
        <span style={{ color: 'var(--color-text)' }}>
          {ROLE_LABEL[user.role]}
        </span>
      </span>

      {/* notifications — static placeholder (no notifications API yet) */}
      <span
        className="flex items-center justify-center rounded-md"
        style={{ width: 34, height: 34, color: 'var(--color-text-muted)' }}
        aria-hidden="true"
      >
        <Bell size={18} />
      </span>

      {/* user menu */}
      <Menu
        trigger={
          <button
            className="ring-focus hover:bg-surface-alt flex h-9 items-center gap-2 rounded-full pl-1 pr-1.5 transition-colors"
            aria-label="User menu"
          >
            <Avatar
              initials={initialsOf(user.name)}
              name={user.name}
              id={user.email}
              size={30}
            />
            <ChevronDown
              size={14}
              style={{ color: 'var(--color-text-muted)' }}
            />
          </button>
        }
      >
        <div
          className="border-b px-3 py-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="text-[13px] font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            {user.name}
          </div>
          <div
            className="text-[12px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {user.email}
          </div>
        </div>
        <MenuItem icon="user">Profile</MenuItem>
        <MenuItem icon="settings">Preferences</MenuItem>
        <div
          className="my-1 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        />
        <MenuItem icon="logout" danger onClick={signOut}>
          Sign out
        </MenuItem>
      </Menu>
    </header>
  );
}
