import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { RecommendationRunDto } from '@logidash/api-client';

const useRecommendationsGetForDelivery = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useRecommendationsGetForDelivery: (...a: unknown[]) =>
      useRecommendationsGetForDelivery(...a),
    useZonesList: () => ({ data: { data: [] }, isPending: false }),
  };
});
vi.mock('../../../app/auth/auth-context', () => ({
  useAuth: () => ({ user: { role: 'dispatcher' } }),
}));

import { RecommendationPanel } from './RecommendationPanel';

const wrap = () =>
  render(
    <MemoryRouter>
      <RecommendationPanel
        deliveryId="d1"
        deliveryStatus="ready"
        assignedDriverId={null}
        onAssign={() => {}}
      />
    </MemoryRouter>,
  );

const run: RecommendationRunDto = {
  id: 'run1',
  deliveryId: 'd1',
  requestedByUserId: 'u1',
  weights: {
    zoneFit: 0.3,
    routeProximity: 0.2,
    remainingCapacity: 0.2,
    workloadBalance: 0.1,
    deadlineFit: 0.1,
    priorityFit: 0.1,
  },
  candidates: [
    {
      id: 'c1',
      driverId: 'driver1',
      driver: {
        id: 'driver1',
        name: 'Jordan Lee',
        availability: 'available',
        baseZoneId: 'z1',
        activeJobCount: 1,
        maxConcurrentJobs: 3,
        vehicle: {
          id: 'v1',
          type: 'van',
          status: 'available',
          capacityWeight: 500,
        },
      },
      eligible: true,
      score: 82,
      rank: 1,
      explanation: [
        {
          factor: 'zoneFit',
          weight: 0.3,
          rawValue: 0.9,
          weighted: 27,
          reason: 'Driver is based in the delivery zone',
        },
      ],
      ineligibleReasons: null,
    },
    {
      id: 'c2',
      driverId: 'driver2',
      driver: {
        id: 'driver2',
        name: 'Sam Rivera',
        availability: 'busy',
        baseZoneId: 'z2',
        activeJobCount: 3,
        maxConcurrentJobs: 3,
        vehicle: { id: 'v2', type: 'bike', status: 'busy', capacityWeight: 20 },
      },
      eligible: false,
      score: 0,
      rank: null,
      explanation: [],
      ineligibleReasons: ['Driver is at max concurrent jobs'],
    },
  ],
  createdAt: new Date().toISOString(),
};

it('renders ranked candidates and ineligible reasons', async () => {
  useRecommendationsGetForDelivery.mockReturnValue({
    data: run,
    error: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText('82')).toBeInTheDocument();
  expect(screen.getByText('Top pick')).toBeInTheDocument();
  expect(
    screen.getByText('Driver is at max concurrent jobs'),
  ).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /toggle breakdown/i }));
  expect(
    screen.getByText('Driver is based in the delivery zone'),
  ).toBeInTheDocument();
});

it('shows the no-run CTA on a 404 error', () => {
  useRecommendationsGetForDelivery.mockReturnValue({
    data: undefined,
    error: { response: { status: 404 } },
    isPending: false,
    isError: true,
    refetch: vi.fn(),
  });
  wrap();
  expect(screen.getByText(/no recommendation run yet/i)).toBeInTheDocument();
  expect(screen.getByText(/run recommendations/i)).toBeInTheDocument();
});
