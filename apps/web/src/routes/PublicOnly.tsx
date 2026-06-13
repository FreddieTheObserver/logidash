import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/auth/auth-context';
import { LoginPage } from '../features/auth/LoginPage';
import { Splash } from './Splash';

/** The /login route: redirect to the app if already authenticated. */
export function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <LoginPage />;
}
