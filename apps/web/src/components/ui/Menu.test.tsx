import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, MenuItem } from './Menu';

it('opens on trigger and closes on Escape', async () => {
  const user = userEvent.setup();
  render(
    <Menu trigger={<button>Open</button>}>
      <MenuItem>Item</MenuItem>
    </Menu>,
  );
  await user.click(screen.getByText('Open'));
  expect(screen.getByText('Item')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByText('Item')).not.toBeInTheDocument();
});
