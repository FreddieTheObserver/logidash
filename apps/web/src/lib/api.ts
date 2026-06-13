import { configureHttpClient } from '@logidash/api-client';

// Configure the shared API client once, at module load, before any generated
// hook can fire.
configureHttpClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  // Fired only after a silent refresh fails (tokens already cleared by the
  // client). A hard navigation guarantees a clean state reset and shows the
  // login route. /auth/* requests are excluded from retry, so this never loops
  // on the login page itself.
  onSessionExpired: () => {
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  },
});

// Compile-time proof the app consumes generated contract types only.
export type { DeliveryDto, ZoneDto } from '@logidash/api-client';
