import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authLogin, setTokens } from '@logidash/api-client';
import type { LoginDto } from '@logidash/api-client';
import { useAuth } from './auth-context';

export function errorMessageFor(status: number | undefined): string {
  if (status === 401) return 'Invalid email or password.';
  if (status === 403) return 'This account is disabled.';
  return 'Something went wrong. Please try again.';
}

interface AxiosLikeError {
  response?: { status?: number };
}

export function useLogin() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(credentials: LoginDto) {
    setPending(true);
    setError(null);
    try {
      const tokens = await authLogin(credentials);
      setTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      const status = (err as AxiosLikeError).response?.status;
      setError(errorMessageFor(status));
      setPending(false);
    }
  }

  return { login, pending, error };
}
