import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUsersList,
  useUsersUpdate,
  getUsersListQueryKey,
} from '@logidash/api-client';
import type { UserDto, UserDtoRole } from '@logidash/api-client';
import { Chip } from '../../../components/ui/Chip';
import { Avatar } from '../../../components/ui/Avatar';
import { Menu, MenuItem } from '../../../components/ui/Menu';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS } from '../../../components/ui/icons';
import { initials } from '../../../lib/format';
import type { ApiError } from '../../../lib/api-errors';
import type { Tone } from '../../../lib/tone';
import { UserModal } from './UserModal';

const ROLE_TONE: Record<UserDtoRole, Tone> = {
  admin: 'primary',
  dispatcher: 'info',
  driver: 'success',
  viewer: 'neutral',
};

const HEADERS = ['User', 'Email', 'Role', 'Status', 'Created'];

export function UsersTab({
  adding,
  onCloseAdd,
  onSaved,
}: {
  adding: boolean;
  onCloseAdd: () => void;
  onSaved: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const q = useUsersList();
  const update = useUsersUpdate();
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const Alert = ICONS.alert;

  async function toggleStatus(user: UserDto) {
    setRowError(null);
    try {
      await update.mutateAsync({
        id: user.id,
        data: { status: user.status === 'active' ? 'disabled' : 'active' },
      });
      void qc.invalidateQueries({ queryKey: getUsersListQueryKey() });
      onSaved(user.status === 'active' ? 'User disabled.' : 'User re-enabled.');
    } catch (err) {
      const e = err as ApiError;
      // e.g. the last-admin 409 guard
      setRowError(e.response?.data?.message ?? 'Could not update the user.');
    }
  }

  return (
    <>
      {rowError && (
        <div
          className="flex items-center gap-2 border-b px-4 py-2 text-[13px]"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--tint-danger)',
            color: 'var(--color-danger)',
          }}
          role="alert"
        >
          <Alert size={15} />
          {rowError}
        </div>
      )}

      {q.isError ? (
        <ErrorState
          body="Users could not be loaded."
          onRetry={() => void q.refetch()}
        />
      ) : q.isPending ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} h={32} />
          ))}
        </div>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 720 }}>
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
                <th
                  className="border-b"
                  style={{ borderColor: 'var(--color-border)', width: 44 }}
                />
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((u, i) => (
                <tr
                  key={u.id}
                  className="group"
                  style={{
                    background:
                      i % 2 ? 'var(--color-surface-alt)' : 'transparent',
                  }}
                >
                  <td className="h-[46px] px-3 whitespace-nowrap">
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        initials={initials(u.name)}
                        name={u.name}
                        id={u.id}
                        size={28}
                      />
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {u.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <span
                      className="text-[12.5px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {u.email}
                    </span>
                  </td>
                  <td className="px-3">
                    <Chip tone={ROLE_TONE[u.role]} size="sm">
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </Chip>
                  </td>
                  <td className="px-3">
                    <Chip
                      tone={u.status === 'active' ? 'success' : 'neutral'}
                      dot
                      size="sm"
                    >
                      {u.status === 'active' ? 'Active' : 'Disabled'}
                    </Chip>
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <span
                      className="tnum text-[12.5px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-3 text-right">
                    <Menu
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="more"
                          aria-label={`Actions for ${u.name}`}
                        />
                      }
                    >
                      <MenuItem icon="user" onClick={() => setEditing(u)}>
                        Edit
                      </MenuItem>
                      <MenuItem
                        icon={u.status === 'active' ? 'x' : 'check'}
                        danger={u.status === 'active'}
                        onClick={() => void toggleStatus(u)}
                      >
                        {u.status === 'active' ? 'Disable' : 'Enable'}
                      </MenuItem>
                    </Menu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserModal
        open={adding || editing !== null}
        user={editing}
        onClose={() => {
          onCloseAdd();
          setEditing(null);
        }}
        onSaved={onSaved}
      />
    </>
  );
}
