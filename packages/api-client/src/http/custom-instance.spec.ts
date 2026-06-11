import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureHttpClient, customInstance } from './custom-instance';
import { clearTokens, getTokens, setTokens } from './token-storage';

const TOKENS = { accessToken: 'old-access', refreshToken: 'old-refresh' };
const ROTATED = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  tokenType: 'Bearer',
  expiresIn: '15m',
};

type Call = { url: string; auth: string | undefined; data: unknown };

/** Programmable axios adapter: maps url -> ordered list of responses. */
function makeAdapter(
  script: Record<string, Array<{ status: number; data?: unknown }>>,
) {
  const calls: Call[] = [];
  const adapter: AxiosAdapter = vi.fn((config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    calls.push({
      url,
      auth: (config.headers as Record<string, unknown>)?.Authorization as
        | string
        | undefined,
      data: config.data ? JSON.parse(config.data as string) : undefined,
    });
    const next = script[url]?.shift() ?? { status: 200, data: { ok: true } };
    const response: AxiosResponse = {
      status: next.status,
      statusText: '',
      data: next.data ?? {},
      headers: {},
      config,
    };
    return next.status < 400
      ? Promise.resolve(response)
      : Promise.reject(
          Object.assign(new Error(`HTTP ${next.status}`), {
            isAxiosError: true,
            response,
            config,
          }),
        );
  });
  return { adapter, calls };
}

afterEach(() => clearTokens());

describe('customInstance', () => {
  it('attaches the stored access token as a bearer header', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({});
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await customInstance({ url: '/v1/zones', method: 'GET' });
    expect(calls[0].auth).toBe('Bearer old-access');
  });

  it('sends no auth header when logged out', async () => {
    const { adapter, calls } = makeAdapter({});
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await customInstance({ url: '/v1/zones', method: 'GET' });
    expect(calls[0].auth).toBeUndefined();
  });

  it('on 401: refreshes, stores rotated tokens, retries with the new token', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({
      '/v1/zones': [{ status: 401 }, { status: 200, data: [{ id: 'z1' }] }],
      '/v1/auth/refresh': [{ status: 200, data: ROTATED }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    const data = await customInstance({ url: '/v1/zones', method: 'GET' });
    expect(data).toEqual([{ id: 'z1' }]);
    expect(getTokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const refresh = calls.find((c) => c.url === '/v1/auth/refresh');
    expect(refresh?.data).toEqual({ refreshToken: 'old-refresh' });
    expect(calls.at(-1)).toMatchObject({
      url: '/v1/zones',
      auth: 'Bearer new-access',
    });
  });

  it('two concurrent 401s trigger exactly one refresh (single-flight)', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({
      '/v1/zones': [{ status: 401 }, { status: 200 }],
      '/v1/drivers': [{ status: 401 }, { status: 200 }],
      '/v1/auth/refresh': [{ status: 200, data: ROTATED }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await Promise.all([
      customInstance({ url: '/v1/zones', method: 'GET' }),
      customInstance({ url: '/v1/drivers', method: 'GET' }),
    ]);
    expect(calls.filter((c) => c.url === '/v1/auth/refresh')).toHaveLength(1);
  });

  it('failed refresh clears tokens, fires onSessionExpired, propagates the error', async () => {
    setTokens(TOKENS);
    const onSessionExpired = vi.fn();
    const { adapter } = makeAdapter({
      '/v1/zones': [{ status: 401 }],
      '/v1/auth/refresh': [{ status: 401 }],
    });
    configureHttpClient({
      baseURL: 'http://api.test',
      adapter,
      onSessionExpired,
    });

    await expect(
      customInstance({ url: '/v1/zones', method: 'GET' }),
    ).rejects.toThrow();
    expect(getTokens()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not attempt refresh for /auth/login 401s (bad credentials)', async () => {
    const { adapter, calls } = makeAdapter({
      '/v1/auth/login': [{ status: 401 }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await expect(
      customInstance({ url: '/v1/auth/login', method: 'POST' }),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url === '/v1/auth/refresh')).toHaveLength(0);
  });

  it('retries at most once (second 401 propagates)', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({
      '/v1/zones': [{ status: 401 }, { status: 401 }],
      '/v1/auth/refresh': [{ status: 200, data: ROTATED }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await expect(
      customInstance({ url: '/v1/zones', method: 'GET' }),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url === '/v1/auth/refresh')).toHaveLength(1);
  });
});
