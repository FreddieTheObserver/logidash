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

import { Sidebar } from './Sidebar';

const stats = {
  deliveries: {
    draft: 1,
    ready: 2,
    active: 3,
    atRisk: 0,
    breached: 0,
    open: 6,
  },
  drivers: { available: 4, busy: 1, offline: 0, total: 5 },
};

it('renders open-deliveries and available-drivers badges from stats', () => {
  useDashboardGetStats.mockReturnValue({ data: stats });
  render(
    <MemoryRouter>
      <Sidebar role="dispatcher" />
    </MemoryRouter>,
  );
  expect(screen.getByText('6')).toBeInTheDocument(); // Deliveries badge
  expect(screen.getByText('4')).toBeInTheDocument(); // Drivers badge
});

it('renders no badges while stats are loading', () => {
  useDashboardGetStats.mockReturnValue({ data: undefined });
  render(
    <MemoryRouter>
      <Sidebar role="dispatcher" />
    </MemoryRouter>,
  );
  expect(screen.queryByText('6')).not.toBeInTheDocument();
  expect(screen.queryByText('4')).not.toBeInTheDocument();
});
