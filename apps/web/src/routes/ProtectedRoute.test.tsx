import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthContextValue } from '../app/auth/auth-context';

let mockAuth: AuthContextValue;
vi.mock('../app/auth/auth-context', () => ({
  useAuth: () => mockAuth,
}));

import { ProtectedRoute } from './ProtectedRoute';

function setup(auth: Partial<AuthContextValue>, path = '/admin') {
  mockAuth = {
    user: null,
    status: 'authenticated',
    refresh: vi.fn(),
    signOut: vi.fn(),
    ...auth,
  } as AuthContextValue;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/admin" element={<div>Admin area</div>} />
        </Route>
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to login', () => {
    setup({ status: 'unauthenticated', user: null });
    expect(screen.getByText('Login')).toBeInTheDocument();
  });
  it('redirects wrong-role users home', () => {
    setup({
      status: 'authenticated',
      user: { id: '1', email: 'd@x', name: 'D', role: 'dispatcher' },
    });
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
  it('renders the route for an allowed role', () => {
    setup({
      status: 'authenticated',
      user: { id: '1', email: 'a@x', name: 'A', role: 'admin' },
    });
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });
});
