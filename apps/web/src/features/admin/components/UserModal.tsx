import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUsersCreate,
  useUsersUpdate,
  getUsersListQueryKey,
  CreateUserDtoRole,
} from '@logidash/api-client';
import type { UserDto, UserDtoStatus } from '@logidash/api-client';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';
import { mapDetailMessages, type ApiError } from '../../../lib/api-errors';

const ROLES = Object.values(CreateUserDtoRole);
type RoleValue = (typeof ROLES)[number];

// The DTO fields this form renders inputs for — 400 details route to them.
const USER_FIELDS = ['name', 'email', 'password', 'role', 'status'] as const;

export function UserModal({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: UserDto | null;
  onSaved: (msg: string) => void;
}) {
  return (
    <Modal
      open={open}
      title={user ? `Edit ${user.name}` : 'Add user'}
      onClose={onClose}
    >
      {open && (
        <UserForm key="form" user={user} onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  );
}

function UserForm({
  user,
  onClose,
  onSaved,
}: {
  user: UserDto | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const create = useUsersCreate();
  const update = useUsersUpdate();
  const isPending = create.isPending || update.isPending;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleValue>(user?.role ?? 'viewer');
  const [status, setStatus] = useState<UserDtoStatus>(user?.status ?? 'active');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const Alert = ICONS.alert;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    try {
      if (user) {
        await update.mutateAsync({ id: user.id, data: { name, role, status } });
      } else {
        await create.mutateAsync({ data: { name, email, password, role } });
      }
      void qc.invalidateQueries({ queryKey: getUsersListQueryKey() });
      onSaved(user ? 'User updated.' : 'User created.');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      const data = e.response?.data;
      if (e.response?.status === 400 && data?.details?.length) {
        const { fields, rest } = mapDetailMessages(data.details, USER_FIELDS);
        setErrors(fields);
        if (rest.length > 0) setFormError(rest.join('; '));
      } else {
        // 409: duplicate email, or the last-admin guard on edit.
        setFormError(data?.message ?? 'Could not save the user.');
      }
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void submit(e);
      }}
      noValidate
    >
      <div className="space-y-3">
        {formError && (
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
            style={{
              background: 'var(--tint-danger)',
              color: 'var(--color-danger)',
            }}
            role="alert"
          >
            <Alert size={15} />
            {formError}
          </div>
        )}

        <Field label="Name" error={errors['name']} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            invalid={!!errors['name']}
          />
        </Field>

        {!user && (
          <>
            <Field label="Email" error={errors['email']} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                invalid={!!errors['email']}
              />
            </Field>
            <Field label="Password" error={errors['password']} required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                invalid={!!errors['password']}
              />
            </Field>
          </>
        )}

        <Field label="Role" error={errors['role']} required>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleValue)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </Field>

        {user && (
          <Field label="Status" error={errors['status']}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as UserDtoStatus)}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
        )}
      </div>

      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Saving…' : user ? 'Save changes' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}
