import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useDeliveriesList = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useDeliveriesList: (...a: unknown[]) => useDeliveriesList(...a),
    useZonesList: () => ({ data: { data: [] }, isPending: false }),
  };
});
vi.mock('../../app/auth/auth-context', () => ({
  useAuth: () => ({ user: { role: 'dispatcher' } }),
}));
vi.mock('./components/NewDeliveryModal', () => ({
  NewDeliveryModal: () => null,
}));

import { DeliveriesPage } from './DeliveriesPage';

const wrap = () =>
  render(
    <MemoryRouter>
      <DeliveriesPage />
    </MemoryRouter>,
  );

it('shows the loading state', () => {
  useDeliveriesList.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(document.querySelector('.skeleton')).not.toBeNull();
});

it('shows the error state', () => {
  useDeliveriesList.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText(/couldn't load this view/i)).toBeInTheDocument();
});

it('shows the empty state when no rows match', () => {
  useDeliveriesList.mockReturnValue({
    data: { data: [], meta: { total: 0, page: 1, limit: 8, totalPages: 1 } },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText(/no deliveries/i)).toBeInTheDocument();
});

it('renders rows in the data state', () => {
  useDeliveriesList.mockReturnValue({
    data: {
      data: [
        {
          id: 'd1',
          reference: 'D-1',
          status: 'ready',
          priority: 'high',
          zoneId: 'z1',
          pickupAddress: 'A',
          dropoffAddress: 'B',
          packageSize: 'small',
          packageWeight: 2,
          packageType: 'box',
          deadlineAt: new Date(Date.now() + 3600000).toISOString(),
          assignedDriver: null,
        },
      ],
      meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText('D-1')).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: /unassigned/i })).toBeInTheDocument();
});
