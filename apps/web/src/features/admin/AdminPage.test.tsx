import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useUsersList = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useUsersList: (...a: unknown[]) => useUsersList(...a),
    useUsersCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUsersUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useZonesCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useZonesUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useZonesRemove: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useVehiclesCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useVehiclesUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useVehiclesRemove: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDriversList: () => ({ data: { data: [] }, isPending: false }),
    useZonesList: () => ({
      data: { data: [], meta: { page: 1, limit: 1, total: 3, totalPages: 3 } },
      isPending: false,
    }),
    useVehiclesList: () => ({
      data: { data: [], meta: { page: 1, limit: 1, total: 4, totalPages: 4 } },
      isPending: false,
    }),
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { AdminPage } from './AdminPage';

const users = [
  {
    id: 'u1',
    email: 'ana@logidash.dev',
    name: 'Ana Admin',
    role: 'admin',
    status: 'active',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'u2',
    email: 'vic@logidash.dev',
    name: 'Vic Viewer',
    role: 'viewer',
    status: 'disabled',
    createdAt: '2026-05-02T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
  },
];

const wrap = () =>
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );

it('renders the users table with role and status chips', () => {
  useUsersList.mockReturnValue({
    data: users,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText('Ana Admin')).toBeInTheDocument();
  expect(screen.getByText('ana@logidash.dev')).toBeInTheDocument();
  expect(screen.getByText('Admin')).toBeInTheDocument();
  expect(screen.getByText('Disabled')).toBeInTheDocument();
});

it('switches tabs and shows per-tab counts', async () => {
  useUsersList.mockReturnValue({
    data: users,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText('2')).toBeInTheDocument(); // users count
  expect(screen.getByText('3')).toBeInTheDocument(); // zones count
  expect(screen.getByText('4')).toBeInTheDocument(); // vehicles count

  await userEvent.click(screen.getByRole('tab', { name: /zones/i }));
  expect(screen.getByText(/no zones yet/i)).toBeInTheDocument();
  expect(screen.queryByText('Ana Admin')).not.toBeInTheDocument();
});

it('opens the add-user modal from the header button', async () => {
  useUsersList.mockReturnValue({
    data: users,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  await userEvent.click(screen.getByRole('button', { name: /add user/i }));
  // The open modal is the only place these inputs exist.
  expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Min 8 characters')).toBeInTheDocument();
});
