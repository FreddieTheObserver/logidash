# API Security Hardening — 2026-06-08

Branch: `claude/api-security-hardening` (merged to `main`).

A security/code review of the logidash API surface (auth, guards, token
handling, config, global exception filter, domain modules) produced the findings
below. High → medium → low severity fixes were implemented in that order. This
document is the durable record plus the checklist to finish verification on a
machine with Docker.

## Findings & status

### High — fixed

1. **No rate limiting on auth endpoints.** `POST /v1/auth/login` and
   `/auth/refresh` were public and unthrottled — open to credential stuffing and
   brute force.
   - Added `@nestjs/throttler` (^6.5.0). Global `ThrottlerModule.forRoot`
     (100 req / 60s per IP) + `ThrottlerGuard` via `APP_GUARD` in
     `apps/api/src/app.module.ts`.
   - Stricter `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `login` and
     `refresh` in `apps/api/src/modules/auth/auth.controller.ts`.
   - `skipIf: NODE_ENV === 'test'` so the e2e suites' rapid logins don't trip 429.

2. **Swagger exposed in production.** `SwaggerModule.setup` ran in every
   environment, publishing the full API surface (`/docs`, `/docs-json`) to
   anonymous callers.
   - `apps/api/src/main.ts`: Swagger setup wrapped in `NODE_ENV !== 'production'`.

### Medium — fixed

3. **No security headers.** Added `helmet()` global middleware in `main.ts`
   (HSTS, X-Content-Type-Options, frameguard, etc.).

4. **Weak JWT secret policy.** `JWT_SECRET` required only 16 chars and
   `.env.example` shipped a `change-me` placeholder that passed validation.
   - `apps/api/src/config/env.validation.ts`: require ≥ 32 chars and reject a
     `change-me` placeholder when `NODE_ENV=production`.
   - `.env.example` updated with an `openssl rand -base64 32` hint.

5. **Login email-enumeration timing channel.** `login()` skipped the password
   hash comparison when no user matched, so unknown emails returned faster than
   wrong passwords.
   - `apps/api/src/modules/auth/auth.service.ts`: always run an argon2 verify,
     against a decoy hash seeded in `onModuleInit`, when the user is unknown.

6. **Last-admin lockout.** `PATCH /users/:id` could demote/disable the only
   active admin, locking everyone out.
   - `apps/api/src/modules/users/users.service.ts`: 409 when an update would
     leave no active admin.

### Low — fixed

7. **Refresh tokens never pruned.** Expired rows accumulated forever.
   - `apps/api/src/modules/auth/tokens/refresh-token.service.ts`: `mint`/`rotate`
     delete the user's already-expired tokens. (Revoked-but-unexpired rows are
     kept so reuse detection still works within the validity window.)

8. **Grammar bug** in the revoked-token error: `"is has been revoked"` →
   `"has been revoked"` (same file).

9. **Prisma errors surfaced as 500.** P2025/P2002 that slip past service guards
   (e.g. races) returned an opaque 500.
   - `apps/api/src/common/filters/all-exceptions.filter.ts`: map P2025 → 404 and
     P2002 → 409 via a structural type guard (no Prisma class import).

### Intentionally NOT done

- **`ParseUUIDPipe` on `:id` params.** Entity IDs are `cuid()` on plain `String`
  columns, not Postgres `uuid`. A malformed `:id` simply misses the lookup and
  returns a clean 404 (no `P2023`/500), and `ParseUUIDPipe` would reject every
  valid cuid. Adding it would be a bug.

## Verification

Green in the cloud container:

- `npm run build`
- `npm run lint`
- `npm test` — **38 unit tests, 8 suites**
- Throwaway DI-compile smoke test: `AppModule` resolves with the throttler guard
  wired (catches DI errors a build can't), without a DB connection.

**Not runnable in the cloud container:** the e2e suite, because it needs Docker
Postgres on host port 5433. This is the one gap to close on a laptop.

## Checklist — when you're back at your laptop (Docker available)

```bash
cd ~/logidash
git checkout main && git pull        # the hardening work is merged here

# 1. Start the DB (Postgres on host port 5433)
#    Open Docker Desktop, then:
docker compose up -d

# 2. Clean, lockfile-exact install (throttler + helmet are in the lock).
#    IMPORTANT: use `npm ci`, not `npm install` — incremental installs break
#    Jest's ts-jest resolution in fresh trees.
npm ci

# 3. Apply migrations + seed
cd apps/api
npm run db:migrate:deploy   # or: npm run db:migrate
npm run db:seed             # demo accounts, password Demo123!

# 4. The verification that COULDN'T run in the cloud:
npm run test:e2e            # needs Postgres on 5433

# 5. Re-confirm the rest locally
npm run build && npm run lint && npm test

# 6. Optional manual smoke of the fixes:
npm run start:dev
#   - GET http://localhost:3000/docs        -> reachable in dev
#   - POST /v1/auth/login 6x quickly         -> 6th returns HTTP 429
#   - response headers include helmet's X-Content-Type-Options, etc.

# 7. Production sanity (before any deploy):
#   - NODE_ENV=production with a real JWT_SECRET (openssl rand -base64 32);
#     a "change-me" secret is rejected at boot.
#   - GET /docs returns 404 in production.
```

## Follow-ups (not in scope here)

- Account lockout after repeated failed logins (complements rate limiting).
- Password complexity / breached-password checks on user creation.
- Scheduled global refresh-token cleanup (current pruning is per-user, on
  mint/rotate).
