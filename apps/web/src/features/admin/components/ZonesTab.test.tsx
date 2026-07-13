import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutateRemove = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useZonesList: () => ({
      data: {
        data: [
          {
            id: 'z1',
            name: 'North District',
            code: 'NORTH',
            centerLat: 13.75,
            centerLng: 100.5,
            createdAt: '',
            updatedAt: '',
          },
        ],
        meta: { page: 1, limit: 8, total: 1, totalPages: 1 },
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useZonesCreate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useZonesUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useZonesRemove: () => ({ mutateAsync: mutateRemove, isPending: false }),
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { ZonesTab } from './ZonesTab';

beforeEach(() => {
  mutateRemove.mockReset();
});

const props = {
  adding: false,
  onCloseAdd: vi.fn(),
  onSaved: vi.fn(),
};

it('renders zone rows with code chip and center coordinates', () => {
  render(<ZonesTab {...props} />);
  expect(screen.getByText('North District')).toBeInTheDocument();
  expect(screen.getByText('NORTH')).toBeInTheDocument();
  expect(screen.getByText('13.75, 100.5')).toBeInTheDocument();
});

it('keeps the delete modal open with the 409 message inline', async () => {
  mutateRemove.mockRejectedValue({
    response: {
      status: 409,
      data: {
        statusCode: 409,
        message: 'Zone is referenced by drivers and cannot be deleted',
      },
    },
  });
  render(<ZonesTab {...props} />);
  await userEvent.click(
    screen.getByRole('button', { name: /actions for north district/i }),
  );
  await userEvent.click(screen.getByRole('button', { name: /delete/i }));
  await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(
    await screen.findByText(/zone is referenced by drivers/i),
  ).toBeInTheDocument();
  // still open — the confirm button is still there
  expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
});

it('deletes and reports success', async () => {
  mutateRemove.mockResolvedValue(undefined);
  const onSaved = vi.fn();
  render(<ZonesTab {...props} onSaved={onSaved} />);
  await userEvent.click(
    screen.getByRole('button', { name: /actions for north district/i }),
  );
  await userEvent.click(screen.getByRole('button', { name: /delete/i }));
  await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(mutateRemove).toHaveBeenCalledWith({ id: 'z1' });
  expect(onSaved).toHaveBeenCalledWith('Zone deleted.');
});
