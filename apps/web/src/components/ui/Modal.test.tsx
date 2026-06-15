import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

it('renders when open and closes on Escape', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <Modal open title="Confirm" onClose={onClose}>
      <p>Body</p>
    </Modal>,
  );
  expect(screen.getByText('Body')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
});

it('renders nothing when closed', () => {
  render(
    <Modal open={false} title="Confirm" onClose={() => {}}>
      <p>Body</p>
    </Modal>,
  );
  expect(screen.queryByText('Body')).not.toBeInTheDocument();
});
