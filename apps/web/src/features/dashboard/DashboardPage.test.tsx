import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useDashboardGetStats = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useDashboardGetStats: (...a: unknown[]) => useDashboardGetStats(...a),
  };
});

import { DashboardPage } from './DashboardPage';

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
  wrap();
  expect(screen.getByText('Pending deliveries')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument(); // ready
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
