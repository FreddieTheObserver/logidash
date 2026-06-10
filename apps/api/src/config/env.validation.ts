import { z } from 'zod';

/**
 * Environment schema for the logidash backend. Validated once at boot so a
 * missing or malformed variable fails fast instead of surfacing as a runtime
 * error deep in a request. Future phases tighten this (e.g. JWT_SECRET becomes
 * required in Phase 3 auth, ORS_API_KEY in Phase 5 maps).
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().url(),
    // HS256 signing key. 32+ chars so brute-forcing the key is infeasible.
    JWT_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
    // Maps (Phase 5). MAPS_PROVIDER selects the adapter implementation; when
    // unset it is derived from ORS_API_KEY presence (see resolveMapsProvider).
    // An empty ORS_API_KEY (the .env.example default) is treated as unset.
    MAPS_PROVIDER: z.enum(['ors', 'mock']).optional(),
    ORS_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined)),
    ORS_BASE_URL: z.string().url().default('https://api.openrouteservice.org'),
    ORS_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((env, ctx) => {
    // Stop a shipped placeholder secret (e.g. the .env.example default) from
    // ever reaching production, where it would be a known, guessable key.
    if (
      env.NODE_ENV === 'production' &&
      /change[\s-]?me/i.test(env.JWT_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must not use a placeholder value in production',
      });
    }
    // Explicitly asking for the real ORS provider without a key would only
    // surface as 401s at request time — fail fast at boot instead.
    if (env.MAPS_PROVIDER === 'ors' && !env.ORS_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ORS_API_KEY'],
        message: 'ORS_API_KEY is required when MAPS_PROVIDER=ors',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Effective maps provider: an explicit MAPS_PROVIDER wins; otherwise use the
 * real ORS adapter when a key is configured and fall back to the deterministic
 * mock so a key-less local dev environment still boots and geocodes.
 */
export function resolveMapsProvider(
  env: Pick<Env, 'MAPS_PROVIDER' | 'ORS_API_KEY'>,
): 'ors' | 'mock' {
  return env.MAPS_PROVIDER ?? (env.ORS_API_KEY ? 'ors' : 'mock');
}

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
