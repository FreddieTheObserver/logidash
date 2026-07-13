import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const useDriversGetById = vi.fn();
const useAssignmentsListByDriver = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useDriversGetById: (...a: unknown[]) => useDriversGetById(...a),
    useAssignmentsListByDriver: (...a: unknown[]) =>
      useAssignmentsListByDriver(...a),
    useZonesList: () => ({
      data: { data: [{ id: 'z1', code: 'NORTH', name: 'North' }] },
      isPending: false,
    }),
  };
});

import { DriverDetailPage } from './DriverDetailPage';

const driver = {
  id: 'drv1',
  userId: 'u1',
  name: 'Priya Kumar',
  availability: 'available',
  baseZoneId: 'z1',
  activeJobCount: 1,
  maxConcurrentJobs: 3,
  vehicle: {
    id: 'v1',
    type: 'van',
    status: 'active',
    capacityWeight: 120,
    capacityVolume: 3.5,
  },
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/drivers/drv1']}>
      <Routes>
        <Route path="/drivers/:id" element={<DriverDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

it('renders profile, workload, and linked assignment history', () => {
  useDriversGetById.mockReturnValue({
    data: driver,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  useAssignmentsListByDriver.mockReturnValue({
    data: {
      data: [
        {
          id: 'asg1',
          deliveryId: 'd9',
          delivery: { id: 'd9', reference: 'DEL-9', status: 'delivered' },
          driverId: 'drv1',
          vehicleId: 'v1',
          status: 'completed',
          assignedByUserId: 'disp1',
          assignedAt: new Date(Date.now() - 3_600_000).toISOString(),
          unassignedAt: null,
          unassignReason: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      meta: { page: 1, limit: 8, total: 1, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();

  expect(screen.getByText('Priya Kumar')).toBeInTheDocument();
  expect(screen.getByText('van · active')).toBeInTheDocument();
  expect(screen.getByText('120 kg')).toBeInTheDocument();
  expect(screen.getByText('1/3')).toBeInTheDocument();

  const link = screen.getByRole('link', { name: 'DEL-9' });
  expect(link).toHaveAttribute('href', '/deliveries/d9');
  expect(screen.getByText('Delivered')).toBeInTheDocument(); // delivery chip
  expect(screen.getByText('Completed')).toBeInTheDocument(); // assignment chip
});

it('shows the error state when the driver fails to load', () => {
  useDriversGetById.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: vi.fn(),
  });
  useAssignmentsListByDriver.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText(/driver could not be loaded/i)).toBeInTheDocument();
});
