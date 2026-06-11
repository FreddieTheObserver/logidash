import { configureHttpClient } from '@logidash/api-client';

// Configure the shared API client once, at module load, before any
// generated hook can fire. Phase 8 adds onSessionExpired -> login redirect.
configureHttpClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

// Compile-time proof the app consumes generated contract types only.
export type { DeliveryDto, ZoneDto } from '@logidash/api-client';
