import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutateCreate = vi.fn();
const mutateUpdate = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useUsersCreate: () => ({ mutateAsync: mutateCreate, isPending: false }),
    useUsersUpdate: () => ({ mutateAsync: mutateUpdate, isPending: false }),
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { UserModal } from './UserModal';

beforeEach(() => {
  mutateCreate.mockReset();
  mutateUpdate.mockReset();
});

it('maps a 400 details response to field errors and stays open', async () => {
  mutateCreate.mockRejectedValue({
    response: {
      status: 400,
      data: {
        statusCode: 400,
        message: 'Validation failed',
        details: ['email must be an email'],
      },
    },
  });
  const onClose = vi.fn();
  render(<UserModal open user={null} onClose={onClose} onSaved={vi.fn()} />);
  await userEvent.type(screen.getByPlaceholderText('Full name'), 'New User');
  await userEvent.type(
    screen.getByPlaceholderText('name@company.com'),
    'not-an-email',
  );
  await userEvent.type(
    screen.getByPlaceholderText('Min 8 characters'),
    'Password1',
  );
  await userEvent.click(screen.getByRole('button', { name: /create user/i }));

  expect(await screen.findByText('email must be an email')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it('surfaces a 409 business-rule message form-level', async () => {
  mutateUpdate.mockRejectedValue({
    response: {
      status: 409,
      data: {
        statusCode: 409,
        message: 'Cannot demote the only active admin',
      },
    },
  });
  const onClose = vi.fn();
  render(
    <UserModal
      open
      user={{
        id: 'u1',
        email: 'ana@logidash.dev',
        name: 'Ana Admin',
        role: 'admin',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      }}
      onClose={onClose}
      onSaved={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

  expect(await screen.findByText(/only active admin/i)).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it('creates a user and closes on success', async () => {
  mutateCreate.mockResolvedValue({ id: 'u9' });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<UserModal open user={null} onClose={onClose} onSaved={onSaved} />);
  await userEvent.type(screen.getByPlaceholderText('Full name'), 'New User');
  await userEvent.type(
    screen.getByPlaceholderText('name@company.com'),
    'new@logidash.dev',
  );
  await userEvent.type(
    screen.getByPlaceholderText('Min 8 characters'),
    'Password1',
  );
  await userEvent.click(screen.getByRole('button', { name: /create user/i }));

  expect(mutateCreate).toHaveBeenCalledWith({
    data: {
      name: 'New User',
      email: 'new@logidash.dev',
      password: 'Password1',
      role: 'viewer',
    },
  });
  expect(onSaved).toHaveBeenCalledWith('User created.');
  expect(onClose).toHaveBeenCalled();
});
