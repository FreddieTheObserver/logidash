import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useDriversList = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useDriversList: (...a: unknown[]) => useDriversList(...a),
    useZonesList: () => ({
      data: { data: [{ id: 'z1', code: 'NORTH', name: 'North' }] },
      isPending: false,
    }),
  };
});

import { DriversPage } from './DriversPage';

const drivers = [
  {
    id: 'drv1',
    userId: 'u1',
    name: 'Priya Kumar',
    availability: 'available',
    baseZoneId: 'z1',
    activeJobCount: 1,
    maxConcurrentJobs: 3,
    vehicle: { id: 'v1', type: 'van', status: 'active' },
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'drv2',
    userId: 'u2',
    name: 'Ben Osei',
    availability: 'busy',
    baseZoneId: 'z1',
    activeJobCount: 3,
    maxConcurrentJobs: 3,
    vehicle: null,
    createdAt: '',
    updatedAt: '',
  },
];

const wrap = () =>
  render(
    <MemoryRouter>
      <DriversPage />
    </MemoryRouter>,
  );

it('shows the loading state', () => {
  useDriversList.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(document.querySelector('.skeleton')).not.toBeNull();
});

it('renders driver rows with name, zone, vehicle, workload', () => {
  useDriversList.mockReturnValue({
    data: {
      data: drivers,
      meta: { page: 1, limit: 8, total: 2, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText('Priya Kumar')).toBeInTheDocument();
  // 'Available' appears in the toolbar option AND the row chip
  expect(screen.getAllByText('Available').length).toBe(2);
  expect(screen.getAllByText('NORTH').length).toBe(2);
  expect(screen.getByText('van')).toBeInTheDocument();
  expect(screen.getByText('1/3')).toBeInTheDocument();
  expect(screen.getByText('3/3')).toBeInTheDocument();
});

it('filters rows client-side by search', async () => {
  useDriversList.mockReturnValue({
    data: {
      data: drivers,
      meta: { page: 1, limit: 8, total: 2, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  await userEvent.type(screen.getByLabelText('Search drivers'), 'ben');
  expect(screen.queryByText('Priya Kumar')).not.toBeInTheDocument();
  expect(screen.getByText('Ben Osei')).toBeInTheDocument();
});
