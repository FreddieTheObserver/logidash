import { useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAuthMe,
  getAuthMeQueryKey,
  authLogout,
  getTokens,
  clearTokens,
} from '@logidash/api-client';
import { AuthContext, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const hasToken = getTokens() !== null;

  const me = useAuthMe({
    query: { enabled: hasToken, retry: false, staleTime: 5 * 60_000 },
  });

  const status: AuthStatus = !hasToken
    ? 'unauthenticated'
    : me.isPending
      ? 'loading'
      : me.isSuccess
        ? 'authenticated'
        : 'unauthenticated';

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: getAuthMeQueryKey() });
  }, [qc]);

  const signOut = useCallback(() => {
    const tokens = getTokens();
    if (tokens) {
      void authLogout({ refreshToken: tokens.refreshToken }).catch(() => {});
    }
    clearTokens();
    qc.clear();
    window.location.assign('/login');
  }, [qc]);

  return (
    <AuthContext.Provider
      value={{ user: me.data ?? null, status, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
