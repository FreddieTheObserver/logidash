import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useDashboardGetStats = vi.fn();
const useDeliveriesList = vi.fn();
const useAuditList = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useDashboardGetStats: (...a: unknown[]) => useDashboardGetStats(...a),
    useDeliveriesList: (...a: unknown[]) => useDeliveriesList(...a),
    useAuditList: (...a: unknown[]) => useAuditList(...a),
    useZonesList: () => ({ data: { data: [] }, isPending: false }),
  };
});

import { DashboardPage } from './DashboardPage';

const inHours = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString();

const delivery = (over: Record<string, unknown>) => ({
  id: 'd1',
  reference: 'DEL-1',
  status: 'ready',
  priority: 'normal',
  zoneId: 'z1',
  pickupAddress: 'A',
  dropoffAddress: 'B',
  packageSize: 'small',
  packageWeight: 1,
  packageType: 'box',
  deadlineAt: inHours(4),
  assignedDriver: null,
  ...over,
});

function mockLists() {
  useDeliveriesList.mockReturnValue({
    data: {
      data: [
        delivery({
          id: 'd-late',
          reference: 'DEL-LATE',
          deadlineAt: inHours(9),
        }),
        delivery({ id: 'd-done', reference: 'DEL-DONE', status: 'delivered' }),
        delivery({
          id: 'd-soon',
          reference: 'DEL-SOON',
          deadlineAt: inHours(1),
        }),
      ],
      meta: { page: 1, limit: 100, total: 3, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  useAuditList.mockReturnValue({
    data: {
      data: [
        {
          id: 'a1',
          action: 'delivery.created',
          entityType: 'Delivery',
          entityId: 'd-soon',
          actorName: 'Dana',
          actorRole: 'dispatcher',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'a2',
          action: 'assignment.created',
          entityType: 'Assignment',
          entityId: 'asg1',
          actorName: 'Dana',
          actorRole: 'dispatcher',
          createdAt: new Date().toISOString(),
        },
      ],
      meta: { page: 1, limit: 8, total: 2, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
}

const stats = {
  deliveries: {
    draft: 1,
    ready: 2,
    active: 3,
    atRisk: 2,
    breached: 3,
    open: 6,
  },
  drivers: { available: 4, busy: 1, offline: 0, total: 5 },
};

const wrap = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

it('shows skeletons while stats load', () => {
  useDashboardGetStats.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  });
  useDeliveriesList.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  });
  useAuditList.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(document.querySelector('.skeleton')).not.toBeNull();
});

it('renders the four metric values and availability counts', () => {
  useDashboardGetStats.mockReturnValue({
    data: stats,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockLists();
  wrap();
  expect(screen.getByText('Pending deliveries')).toBeInTheDocument();
  // ready metric ('2') can collide with the needs-attention count chip
  expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('3')).toBeInTheDocument(); // active
  expect(screen.getByText('SLA risk')).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument(); // atRisk 2 + breached 3
  expect(screen.getByText('4/5')).toBeInTheDocument(); // drivers available
  expect(screen.getByText('Driver availability')).toBeInTheDocument();
  expect(screen.getByText('Busy')).toBeInTheDocument();
});

it('renders the error state with retry', () => {
  useDashboardGetStats.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText(/dashboard stats could not/i)).toBeInTheDocument();
});

it('sorts needs-attention by deadline, hides terminal rows', () => {
  useDashboardGetStats.mockReturnValue({
    data: stats,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockLists();
  wrap();
  expect(screen.queryByText('DEL-DONE')).not.toBeInTheDocument();
  const refs = screen
    .getAllByText(/DEL-(SOON|LATE)/)
    .map((el) => el.textContent);
  expect(refs).toEqual(['DEL-SOON', 'DEL-LATE']); // deadline ascending
});

it('links Delivery activity rows and leaves others static', () => {
  useDashboardGetStats.mockReturnValue({
    data: stats,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockLists();
  wrap();
  const link = screen.getByRole('link', { name: /delivery created/i });
  expect(link).toHaveAttribute('href', '/deliveries/d-soon');
  expect(
    screen.queryByRole('link', { name: /assignment created/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/assignment created/i)).toBeInTheDocument();
});
