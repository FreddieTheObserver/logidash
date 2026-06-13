import { describe, it, expect, vi, beforeEach } from 'vitest';

const setTokens = vi.fn();
const authLogin = vi.fn();
vi.mock('@logidash/api-client', () => ({
  authLogin: (...a: unknown[]) => authLogin(...a),
  setTokens: (...a: unknown[]) => setTokens(...a),
}));

import { errorMessageFor } from './useLogin';

describe('errorMessageFor', () => {
  beforeEach(() => vi.clearAllMocks());
  it('maps statuses to friendly copy', () => {
    expect(errorMessageFor(401)).toMatch(/invalid email or password/i);
    expect(errorMessageFor(403)).toMatch(/disabled/i);
    expect(errorMessageFor(500)).toMatch(/something went wrong/i);
    expect(errorMessageFor(undefined)).toMatch(/something went wrong/i);
  });
});
