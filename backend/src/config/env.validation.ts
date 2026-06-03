import { z } from 'zod';

/**
 * Environment schema for the logidash backend. Validated once at boot so a
 * missing or malformed variable fails fast instead of surfacing as a runtime
 * error deep in a request. Future phases tighten this (e.g. JWT_SECRET becomes
 * required in Phase 3 auth, ORS_API_KEY in Phase 5 maps).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  ORS_API_KEY: z.string().optional(),
  ORS_BASE_URL: z.string().url().default('https://api.openrouteservice.org'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * `validate` hook for `@nestjs/config`. Receives the merged process env and
 * returns the parsed, typed config. Throws with a readable summary on failure.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
