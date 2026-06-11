export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = 'logidash.auth.tokens';

// Fallback so the module also works where localStorage doesn't exist
// (unit tests, non-browser tooling). Browsers always use localStorage.
let memoryTokens: AuthTokens | null = null;

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function getTokens(): AuthTokens | null {
  const store = storage();
  if (!store) return memoryTokens;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthTokens>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string'
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
      };
    }
  } catch {
    // fall through: corrupted payload is treated as logged out
  }
  store.removeItem(STORAGE_KEY);
  return null;
}

export function setTokens(tokens: AuthTokens): void {
  const store = storage();
  if (store) store.setItem(STORAGE_KEY, JSON.stringify(tokens));
  else memoryTokens = tokens;
}

export function clearTokens(): void {
  memoryTokens = null;
  storage()?.removeItem(STORAGE_KEY);
}
