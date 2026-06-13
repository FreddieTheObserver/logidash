import { createContext, useContext } from 'react';
import type { AuthUserDto } from '@logidash/api-client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: AuthUserDto | null;
  status: AuthStatus;
  /** Re-resolve /auth/me after a successful login. */
  refresh: () => Promise<void>;
  /** Best-effort logout + token clear + redirect to /login. */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
