import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '@logidash/api-client';
import { useAuth } from '../app/auth/auth-context';
import { Splash } from './Splash';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  const { status, user } = useAuth();

  if (status === 'loading') return <Splash />;
  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
