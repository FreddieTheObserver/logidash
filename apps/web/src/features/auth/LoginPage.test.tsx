import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const login = vi.fn();
vi.mock('../../app/auth/useLogin', () => ({
  useLogin: () => ({ login, pending: false, error: null }),
}));

import { LoginPage } from './LoginPage';

it('validates then submits credentials', async () => {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(screen.getByText(/valid work email/i)).toBeInTheDocument();
  await user.type(screen.getByLabelText(/work email/i), 'admin@logidash.dev');
  await user.type(screen.getByLabelText(/password/i), 'Demo123!');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(login).toHaveBeenCalledWith({
    email: 'admin@logidash.dev',
    password: 'Demo123!',
  });
});
