import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutateAsync = vi.fn();
vi.mock('@logidash/api-client', () => ({
  useAssignmentsCreate: () => ({ mutateAsync, isPending: false }),
}));

import { AssignModal } from './AssignModal';

const candidate = {
  driverId: 'drv1',
  score: 82,
  rank: 1,
  driver: {
    id: 'drv1',
    name: 'Alex',
    vehicle: { type: 'van' },
    baseZoneId: 'z1',
    activeJobCount: 1,
    maxConcurrentJobs: 3,
  },
} as never;

it('shows the server 409 message inline and stays open', async () => {
  const user = userEvent.setup();
  mutateAsync.mockRejectedValue({
    response: { status: 409, data: { message: 'Driver is not eligible' } },
  });
  render(
    <AssignModal
      open
      deliveryId="d1"
      reference="D-1"
      candidate={candidate}
      onClose={() => {}}
      onAssigned={() => {}}
    />,
  );
  await user.click(screen.getByRole('button', { name: /confirm assign/i }));
  expect(await screen.findByText(/not eligible/i)).toBeInTheDocument();
});
