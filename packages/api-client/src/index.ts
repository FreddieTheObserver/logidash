// Hand-written HTTP layer (auth attach + silent refresh).
export {
  configureHttpClient,
  customInstance,
  type ErrorType,
  type HttpClientConfig,
} from './http/custom-instance';
export {
  clearTokens,
  getTokens,
  setTokens,
  type AuthTokens,
} from './http/token-storage';

// Orval output. Regenerate with `pnpm gen` — never edit by hand.
export * from './generated/model';
export * from './generated/endpoints/audit/audit';
export * from './generated/endpoints/auth/auth';
export * from './generated/endpoints/dashboard/dashboard';
export * from './generated/endpoints/users/users';
export * from './generated/endpoints/zones/zones';
export * from './generated/endpoints/vehicles/vehicles';
export * from './generated/endpoints/drivers/drivers';
export * from './generated/endpoints/deliveries/deliveries';
export * from './generated/endpoints/recommendations/recommendations';
export * from './generated/endpoints/assignments/assignments';
export * from './generated/endpoints/health/health';
