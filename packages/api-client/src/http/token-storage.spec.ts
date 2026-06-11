import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokens, getTokens, setTokens } from './token-storage';

const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' };

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

describe('token storage (localStorage available)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeLocalStorage()));
  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it('round-trips tokens', () => {
    setTokens(TOKENS);
    expect(getTokens()).toEqual(TOKENS);
  });

  it('returns null when nothing stored', () => {
    expect(getTokens()).toBeNull();
  });

  it('clears tokens', () => {
    setTokens(TOKENS);
    clearTokens();
    expect(getTokens()).toBeNull();
  });

  it('treats corrupted JSON as logged out', () => {
    localStorage.setItem('logidash.auth.tokens', '{not json');
    expect(getTokens()).toBeNull();
  });
});

describe('token storage (no localStorage — memory fallback)', () => {
  afterEach(() => clearTokens());

  it('round-trips tokens in memory', () => {
    setTokens(TOKENS);
    expect(getTokens()).toEqual(TOKENS);
    clearTokens();
    expect(getTokens()).toBeNull();
  });
});
