import Axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  clearTokens,
  getTokens,
  setTokens,
  type AuthTokens,
} from './token-storage';

export interface HttpClientConfig {
  baseURL: string;
  /** Fired after a failed silent refresh — the session is unrecoverable. */
  onSessionExpired?: () => void;
  /** Test seam: lets unit tests stub the transport. */
  adapter?: AxiosAdapter;
}

/** Matches AuthTokensDto from the API contract (extra fields ignored). */
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_PATH = '/v1/auth/refresh';
const NO_RETRY_PATHS = [
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
];

let instance: AxiosInstance | null = null;
let clientConfig: HttpClientConfig | null = null;
let refreshInFlight: Promise<AuthTokens> | null = null;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function isRetriableAuthError(
  error: unknown,
): error is AxiosError & { config: RetriableConfig } {
  if (!Axios.isAxiosError(error)) return false;
  if (error.response?.status !== 401 || !error.config) return false;
  if ((error.config as RetriableConfig)._retried) return false;
  const url = error.config.url ?? '';
  return !NO_RETRY_PATHS.some((path) => url.includes(path));
}

async function refreshTokens(): Promise<AuthTokens> {
  // Single-flight: concurrent 401s share one refresh; rotation means a
  // second concurrent refresh with the same token would be reuse-detected.
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<AuthTokens> {
  const current = getTokens();
  if (!current) {
    expireSession();
    throw new Error('No refresh token available');
  }
  try {
    // Bare axios, NOT the instance: must not recurse through interceptors.
    const { data } = await Axios.post<RefreshResponse>(
      REFRESH_PATH,
      { refreshToken: current.refreshToken },
      { baseURL: clientConfig?.baseURL, adapter: clientConfig?.adapter },
    );
    const next = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
    setTokens(next);
    return next;
  } catch (error) {
    expireSession();
    throw error;
  }
}

function expireSession(): void {
  clearTokens();
  clientConfig?.onSessionExpired?.();
}

/** Call once at app startup, before any generated hook runs. */
export function configureHttpClient(config: HttpClientConfig): AxiosInstance {
  clientConfig = config;
  refreshInFlight = null;
  instance = Axios.create({ baseURL: config.baseURL, adapter: config.adapter });

  instance.interceptors.request.use((request) => {
    const tokens = getTokens();
    if (tokens) {
      request.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return request;
  });

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isRetriableAuthError(error)) throw error;
    error.config._retried = true;
    await refreshTokens();
    // Request interceptor re-attaches the (now rotated) access token.
    return instance!.request(error.config);
  });

  return instance;
}

/** Orval mutator: every generated hook funnels through here. */
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  if (!instance) {
    throw new Error(
      'HTTP client not configured — call configureHttpClient({ baseURL }) at app startup',
    );
  }
  return instance.request<T>(config).then((response) => response.data);
};

/** Lets Orval type hook errors as AxiosError<ErrorResponseDto>. */
export type ErrorType<TError> = AxiosError<TError>;
