# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 5 — Maps Integration (OpenRouteService): **COMPLETE (7/7 tasks,
  2026-06-10).** `modules/maps/` ships the `MapsProvider` interface
  (`MAPS_PROVIDER` injection token + typed `MapsProviderError`:
  timeout/http/network), `OrsMapsProvider` (native `fetch` +
  `AbortSignal.timeout(ORS_TIMEOUT_MS)`, Pelias `/geocode/search` +
  `/v2/directions/driving-car`, no key/body leakage in errors), a
  deterministic `MockMapsProvider` (FNV-1a hash geocode in a 0.15° box around
  a fixed city center + haversine × 1.3 routes at 30 km/h), and a
  `MapsService` facade with read-through `RouteEstimate` caching keyed by
  4-decimal rounded coordinates (`upsert` absorbs concurrent misses; provider
  failure → `null` so Phase 6 can fall back to zone proximity). Provider is
  env-selected (`MAPS_PROVIDER=ors|mock`; unset → `ors` iff `ORS_API_KEY` is
  non-empty, else `mock`; explicit `ors` without a key fails at boot).
  Deliveries geocode pickup/dropoff **best-effort** on create and re-geocode
  only changed addresses on update (failure leaves/resets coords `null`,
  never blocks the write). e2e harness forces `MAPS_PROVIDER=mock` — no real
  network in any test. Verified green: build, lint, **96 unit (16 suites)**,
  **27 e2e (5 suites)**. Branch `phase-5-maps-integration`.
  **Next: Phase 6 — Recommendation Engine & Assignments.**
- Phase 4 — Core Domain Modules (Drivers, Vehicles, Zones, Deliveries):
  **COMPLETE.** Core domain shipped across two slices (Zones, Vehicles, Drivers,
  Deliveries, Audit). The only remaining lifecycle piece — assignment
  **creation** (`ready → assigned`) and the recommendation engine — is Phase 6.
- Phase 4 — Slice 2 (Drivers + Deliveries + Audit): **COMPLETE (7/7 tasks).**
  Plan at
  `docs/superpowers/plans/2026-06-07-phase-4-slice-2-drivers-deliveries-audit.md`.
  Shipped: append-only, transaction-aware `AuditModule`
  (`AuditService.record(entry, tx?)`); `DriversModule` (profile CRUD,
  availability, base zone, read-only `activeJobCount`, driver↔vehicle link);
  pure `delivery-status` state machine (spec §8); `DeliveriesModule` (CRUD +
  status/priority/zone/deadline filters + the `PATCH /v1/deliveries/:id/status`
  endpoint enforcing the transition graph + role matrix, closing assignments and
  decrementing workload, and writing the status-change audit row inside one
  `$transaction`). Verified green: build, lint, **60 unit tests (12 suites)**,
  and **24 e2e (4 suites)**. Work on branch
  `phase-4-slice-2-drivers-deliveries-audit`. **Deferred to Phase 6:** assignment
  _creation_ (the status endpoint 409s a direct `→ assigned`).
- Phase 4 — Slice 1 (Foundations + Zones + Vehicles): **COMPLETE (6/6 tasks).**
  Plan at
  `docs/superpowers/plans/2026-06-06-phase-4-slice-1-foundations-zones-vehicles.md`.
  Shipped: global exception filter (`common/filters/`, via `APP_FILTER`), offset
  pagination envelope (`common/` query + meta DTOs, `paginate()`/`toSkipTake()`,
  `@ApiPaginatedResponse()`), plus `ZonesModule` + `VehiclesModule` — role-gated,
  paginated, Swagger-documented CRUD with referential-delete 409 guards. Verified
  green: build, lint, unit, and a zones/vehicles role-matrix e2e (17 e2e total).
  Work on branch `phase-4-slice-1-zones-vehicles`.
- Phase 3 — Auth & Authorization: **complete (11/11 tasks).** JWT access +
  rotating refresh tokens (hashed, reuse-detected), four-role authorization
  via global `JwtAuthGuard` → `RolesGuard` with `@Public()` opt-out, admin
  `UsersModule`, Swagger bearer scheme, and a role-matrix/token-flow e2e —
  all green. Code under `apps/api/src/modules/{auth,users}` + `src/common`.
- Phase 2 — Database Schema & Prisma: **complete**. Full relational model via
  Prisma 7, initial migration, NestJS `PrismaModule`/`PrismaService`, and
  reproducible demo seed (`npm run db:seed`).

## Current Goal

- Phase 5 is **done**. Next: **Phase 6 — Recommendation Engine & Assignments**
  — eligibility rules + scoring factors as pure functions,
  `GET /deliveries/:id/recommendations` (persisting `RecommendationRun` /
  `RecommendationCandidate`), and `AssignmentsModule` with assignment
  **creation** (the deferred `ready → assigned` edge). The engine consumes
  `MapsService.getRouteEstimate` for `routeProximity`/`deadlineFit` and must
  fall back to zone-based proximity when it returns `null` (ORS unavailable),
  flagging the estimate as unavailable in the explanation.
- API routes are now URL-versioned under `/v1` (landed 2026-06-06, on `main`):
  NestJS URI versioning with global `defaultVersion: '1'`; `health`/`docs`
  version-neutral. New Phase 4 controllers inherit `/v1` automatically — no
  per-controller version decorator needed.
- Continuous integration (GitHub Actions) landed 2026-06-10 on `main`:
  `.github/workflows/ci.yml` runs on every branch push + PRs to `main`, with two
  parallel jobs — `quality` (`lint:check`, `format:check`, build api+web, 60 unit
  tests) and `e2e` (a `postgres:16` service → `prisma migrate deploy` → 24 e2e
  tests). No GitHub secrets required (the e2e harness self-provides `JWT_SECRET`
  and points `DATABASE_URL` at the service). Supporting changes: read-only
  `lint:check` scripts with the generated Prisma client excluded from ESLint and
  Prettier, and a `.gitattributes` enforcing LF line endings. Deployment infra
  remains deferred to Phase 9.
- Package manager: **pnpm** workspaces (migrated from npm during CI setup,
  2026-06-10). pnpm's `supportedArchitectures` (in `pnpm-workspace.yaml`) records
  native optional dependencies for every platform in one committed lockfile, so
  `pnpm install --frozen-lockfile` is reproducible on Windows/Linux/macOS — fixing
  the cross-platform CI break npm's single-platform lockfile caused
  (npm/cli#4828, on Vite 8 / Rolldown's per-OS binary). Build scripts are
  allowlisted via `onlyBuiltDependencies`; CI installs with
  `pnpm install --frozen-lockfile` in both jobs.

## Completed

- Brainstormed and approved the product design (backend-first logistics
  dispatch API platform with scoring-based recommendations).
- Created workspace `logidash/` (monorepo intent: `backend/` + `frontend/`).
- Wrote `docs/context/project-overview.md`.
- Wrote `docs/context/architecture.md`.
- Wrote `docs/context/code-standards.md`.
- Wrote `docs/context/ai-workflow-rules.md`.
- Wrote `docs/context/ui-context.md`.
- Wrote design spec under `docs/superpowers/specs/`.
- Wrote `docs/implementation-tools.md` (tooling decisions).
- Wrote `docs/implementation-plan.md` (phased plan).
- **Phase 1 — scaffold:**
  - Root npm-workspace `package.json` (`backend`, `frontend`) + scripts
    (`dev` via `concurrently`, `build`, `lint`, `test`, `format`).
  - Root `.prettierrc`, `.prettierignore`, `.editorconfig`; extended root
    `.gitignore`. ESLint kept per-package (flat config).
  - Scaffolded `backend/` (NestJS 11, `strict: true`) and `frontend/`
    (Vite + React 19 + TS); removed generator demo/placeholder files.
  - `backend`: `@nestjs/config` + Zod env validation (`src/config/`),
    `HealthModule` (`GET /health`), global `ValidationPipe`, CORS from
    `FRONTEND_ORIGIN`. Unit + e2e tests for health (green).
  - `docker-compose.yml` (PostgreSQL 16); `.env.example` for both packages
    (+ gitignored `backend/.env` for local boot).
- **Phase 2 — database schema & Prisma:**
  - Prisma 7 + `@prisma/adapter-pg`; full spec §6 schema (10 entities, enums,
    relations, indexes, `RouteEstimate.cacheKey` unique constraint).
  - Initial migration `20260602161354_init`; `PrismaModule`/`PrismaService`
    (global, CJS client, lifecycle hooks).
  - Seed script (`npm run db:seed`): demo accounts per role, 3 zones, 3 drivers
    - vehicles, 6 deliveries in mixed statuses. Demo password: `Demo123!`.
  - Docker Postgres host port **5433** (local PostgreSQL often occupies 5432).
  - Test infra fix (post-review): wiring `PrismaModule` into `AppModule` had
    broken the health **e2e** suite. Two causes resolved — (a) Jest couldn't
    resolve the Prisma 7 client's `.js`-suffixed relative imports → added
    `moduleNameMapper` to both jest configs; (b) the Prisma 7 client loads its
    WASM query compiler via dynamic `import()`, which Jest's VM rejects → test
    scripts now run under `cross-env NODE_OPTIONS=--experimental-vm-modules`.
    `setup-e2e.ts` also pointed at the wrong port (5432) → now 5433. Unit (2)
    and e2e (1) both green.
- **Phase 3 — Auth & Authorization (complete — 11/11):**
  - Task 1: auth + Swagger deps installed (`@nestjs/jwt`, `@nestjs/passport`,
    `passport`, `passport-jwt`, `@nestjs/swagger`); `JWT_SECRET` now **required**
    (min 16 chars) with `JWT_ACCESS_TTL` (`15m`) and `JWT_REFRESH_TTL_DAYS` (`7`)
    added to the env schema; e2e secret bumped to ≥16 chars.
  - Task 2: `RefreshToken` model (SHA-256 `tokenHash` unique, `expiresAt`,
    nullable `revokedAt`) + migration; `User.refreshTokens` relation.
  - Task 3: common auth primitives — `AuthUser` type and `@Public()`,
    `@Roles()`, `@CurrentUser()` decorators.
  - Task 4: `AccessTokenService` — signs HS256 access JWTs (`sub`/`email`/`role`)
    - unit test.
  - Task 5: `RefreshTokenService` — `mint`/`rotate`/`revoke`, hashes stored not
    raw, rotation + family-revocation reuse detection + unit tests.
  - Task 6: admin-only `UsersModule` — service (argon2 hashing, safe DTO
    mapping), controller, `Create`/`Update`/`User` DTOs + service unit tests.
  - Task 7: `auth/` module — login/refresh/logout DTOs, `AuthService` (argon2
    verify, unknown/bad-password → 401, disabled account → 403, token
    issuance) with unit tests, `JwtStrategy` (re-resolves the user, rejects
    disabled), and `AuthController` (`/auth/login|refresh|logout|me`).
  - Task 8: global guards — `JwtAuthGuard` (honors `@Public()`) → `RolesGuard`
    (honors `@Roles()`), `AuthModule` (JwtModule + strategy + `APP_GUARD`
    wiring) registered in `AppModule`; `/health` marked `@Public()`.
  - Task 9: Swagger `/docs` with `addBearerAuth()`; verified live that
    `/docs-json` carries the bearer scheme and the `auth`/`users` paths.
  - Task 10: role-matrix + token-flow e2e (`apps/api/test/auth.e2e-spec.ts`):
    public health, 401 unauth, login, admin-vs-others on `/users` (403),
    refresh rotation + reuse → 401, logout revocation. 8 e2e green.
  - Task 11: docs sync — `architecture.md`, `implementation-plan.md`, and this
    tracker.
  - **NOTE:** Phase 3 domain code lives under `apps/api/src/modules/`
    (`modules/auth/`, `modules/users/`); cross-cutting `common/` (guards,
    decorators, types), `config/`, `prisma/`, `health/` stay at
    `apps/api/src/` root. `AuthModule`/`UsersModule` are now wired into
    `app.module.ts`, so auth is **live and enforced globally**.
  - **NOTE:** Tasks 7–11 were auto-implemented at the user's request
    (2026-06-05), deviating from the original teach-and-build mode used for
    Tasks 1–6. One plan-code fix was needed: the e2e `login` helper must not
    be `async` (an `async` helper returns a Promise, breaking `.expect()`
    chaining and tripping `no-unsafe-*` lint).
- **Phase 4 — Slice 1 (Foundations + Zones + Vehicles) — complete (6/6):**
  - Tasks 1–2 (earlier session): global exception filter (`common/filters/`,
    via `APP_FILTER`) + offset pagination envelope (`common/dto/pagination-*`,
    `common/pagination/paginate.ts`, `@ApiPaginatedResponse()`).
  - Task 3 `ZonesModule`: role-gated CRUD (admin/dispatcher write; any-auth
    read), pagination via `$transaction([findMany, count])`, Decimal→number
    mapping, and a referential-delete **409** guard (drivers/deliveries).
    TDD: service spec written first (red→green). Built teach-and-build.
  - Task 4 `VehiclesModule`: same module shape — CRUD, `VehicleType`/
    `VehicleStatus` enums, `@IsPositive()` capacities, `driverId` as read-only
    output, assignment referential-delete 409. Auto-implemented.
  - Fix: the hand-typed Zones module file was committed as `zone.module.ts`
    (singular); renamed to `zones.module.ts` to match its `zones.*` siblings.
  - Task 5 e2e (`test/zones-vehicles.e2e-spec.ts`): role matrix (401/403/201),
    `/v1` versioning enforced (bare path 404), paginated envelope, 409 + 400-
    with-`details` error shapes, and a delivery-referenced-zone 409.
  - Task 6: docs sync (this tracker + `implementation-plan.md`).
  - Verified green: build, lint, unit, and **17 e2e** (3 suites). Branch
    `phase-4-slice-1-zones-vehicles`.
- **Phase 4 — Slice 2 (Drivers + Deliveries + Audit) — complete (7/7):**
  - Task 1 `AuditModule`: append-only `AuditService.record(entry, tx?)` —
    transaction-aware (optional Prisma client param) so a status change's audit
    row commits atomically with the mutation; `exports`-ed for other modules.
  - Task 2 `DriversModule`: `DriverProfile` CRUD (admin/dispatcher write;
    any-auth read), create validates the user exists + has role `driver` + has
    no existing profile (409) and that `baseZoneId` resolves; `activeJobCount`
    read-only; `PUT /:id/vehicle` links/unlinks the driver↔vehicle (clears prior
    link, refuses a vehicle owned by another driver); referential-delete 409.
  - Task 3 `delivery-status.ts`: pure, fully-tested spec §8 transition machine —
    `DELIVERY_TRANSITIONS`, `canTransition`, `isDriverTransition` (driver
    operational path), `ASSIGNMENT_CLOSING`.
  - Task 4 `DeliveriesModule`: CRUD + filtered/paginated list
    (status/priority/zone/deadlineBefore); Decimal→number mapping; status only
    ever starts `draft` (never set via create/update).
  - Task 5 status endpoint: `PATCH /v1/deliveries/:id/status` — graph check
    (409 illegal), direct `→ assigned` rejected (409, Phase 6 owns it), role
    matrix (admin/dispatcher any allowed edge; driver only `isDriverTransition`
    on their **own** active assignment, else 403; viewer blocked by `@Roles`).
    In one `$transaction`: update delivery (+ `cancellationReason`), close the
    active assignment (`completed` for delivered, else `cancelled`) + stamp
    `unassignedAt`/`unassignReason` + decrement `activeJobCount` (floored at 0),
    and `AuditService.record(entry, tx)`.
  - Task 6 e2e (`test/drivers-deliveries.e2e-spec.ts`): driver-profile role
    matrix + non-driver 409, delivery CRUD + filter + role gating, illegal
    transition 409, audited `draft → ready`, direct `→ assigned` 409, and a
    seeded-assignment driver path (`assigned → picked_up`) with viewer 403.
  - Task 7: docs sync (this tracker + `implementation-plan.md`).
  - Verified green: build, lint, **60 unit (12 suites)**, and **24 e2e
    (4 suites)**. Branch `phase-4-slice-2-drivers-deliveries-audit`.
- **Phase 5 — Maps Integration (OpenRouteService) — complete (7/7):**
  - Task 1 env + contract: `MAPS_PROVIDER` (`ors|mock`, optional) and
    `ORS_TIMEOUT_MS` (default 5000) added to the env schema; empty
    `ORS_API_KEY` normalized to `undefined`; explicit `MAPS_PROVIDER=ors`
    without a key fails at boot; `resolveMapsProvider()` derives the effective
    provider when unset. `maps-provider.interface.ts` defines `GeoPoint`,
    `RouteResult`, `MapsProvider`, the `MAPS_PROVIDER` token, and
    `MapsProviderError` (kind: `timeout|http|network`); `geocode` resolves
    `null` for "no match" — infrastructure failures throw.
  - Task 2 `MockMapsProvider`: deterministic FNV-1a hash geocode into a 0.15°
    box around Bangkok (per-axis hashes, 6-dp rounding to match
    `Decimal(9,6)`), haversine × 1.3 road factor at 30 km/h for routes.
  - Task 3 `OrsMapsProvider`: native `fetch` (no axios) with
    `AbortSignal.timeout`; Pelias `GET /geocode/search?text&size=1` (GeoJSON
    `[lng, lat]` flipped) + `POST /v2/directions/driving-car`; non-2xx → http,
    abort → timeout, rejection → network; responses parsed as `unknown` +
    narrowed; error messages never include the key/URL/body.
  - Task 4 `MapsService` + `MapsModule`: read-through `RouteEstimate` cache on
    a 4-dp rounded-coordinate key (`"lat,lng->lat,lng"`); miss → provider →
    `upsert` (absorbs concurrent-miss races); `MapsProviderError` → `null`
    (graceful degradation, invariant 7); unexpected errors rethrow. Module
    factory selects Ors/Mock from typed config; exports `MapsService`;
    registered in `AppModule`.
  - Task 5 delivery geocoding: `DeliveriesService` (now importing
    `MapsModule`) geocodes pickup+dropoff **best-effort** on create
    (`Promise.all`, failures → `null` coords, write succeeds) and re-geocodes
    **only changed** addresses on update — a failed re-geocode resets that
    side's coords to `null` (stale coords are worse than none).
  - Task 6 e2e (`test/maps-geocoding.e2e-spec.ts`): create fills coords inside
    the mock demo area, identical addresses geocode identically, update
    re-geocodes pickup while dropoff coords stay intact. `setup-e2e.ts` forces
    `MAPS_PROVIDER=mock` so no suite can ever hit the real ORS.
  - Task 7: docs sync (this tracker, `implementation-plan.md`,
    `implementation-tools.md`).
  - Verified green: build, lint, **96 unit (16 suites)**, **27 e2e
    (5 suites)**. Branch `phase-5-maps-integration`, one commit per task.
- **Structural refactor (2026-06-03):** reorganized to the unishare-style
  monorepo layout — `backend/` → `apps/api`, `frontend/` → `apps/web`, added
  `packages/api-client` (reserved home for the Orval client). Kept npm
  workspaces, Vite, and the Phase 3 JWT auth untouched; folders moved with
  `git mv` so history is preserved. Renamed workspace packages to
  `@logidash/{api,web,api-client}` and updated root scripts, `.gitignore`, and
  context docs. Verified green: `npm install`, `npm run build`, `npm run lint`,
  unit (13) + e2e (1) tests, and `db:seed`. Note: the local (gitignored)
  `apps/api/.env` was reconstructed from `.env.example` (the original was lost
  in the move) — set real secrets there if you had customized them.

## In Progress

- **Security hardening (2026-06-08, branch `claude/api-security-hardening`):**
  high-severity pair from an API security review, landed first.
  (1) **Rate limiting** — added `@nestjs/throttler` (^6.5.0): global
  `ThrottlerModule.forRoot` (100 req / 60s per IP) + `ThrottlerGuard` via
  `APP_GUARD` in `app.module.ts`, with a stricter `@Throttle` (5 / 60s) on
  `POST /auth/login` and `/auth/refresh` (the brute-force/credential-stuffing
  surface). Throttling is `skipIf` `NODE_ENV==='test'` so the e2e suites' rapid
  logins don't trip 429s. (2) **Swagger gated out of production** — the
  `SwaggerModule` setup in `main.ts` is now wrapped in
  `NODE_ENV !== 'production'`, so `/docs` + `/docs-json` (full API surface) are
  no longer exposed to anonymous callers in prod.
  - **Medium-severity follow-ups (same branch):**
    (3) **helmet** — `app.use(helmet())` in `main.ts` for standard security
    response headers (HSTS, X-Content-Type-Options, frameguard, …).
    (4) **JWT_SECRET tightened** — env schema now requires ≥32 chars (was 16)
    and rejects a `change-me` placeholder when `NODE_ENV=production`;
    `.env.example` updated with an `openssl rand -base64 32` hint.
    (5) **Login timing / email enumeration** — `login()` always runs an argon2
    verify (against a decoy hash seeded in `onModuleInit`) when the user is
    unknown, so unknown-email and wrong-password take the same time.
    (6) **Last-admin lockout** — `PATCH /users/:id` now 409s if it would demote
    or disable the only active admin.
  - **`ParseUUIDPipe` finding DROPPED:** entity IDs are `cuid()` (plain `String`
    columns), not UUIDs — a malformed `:id` simply misses the lookup and returns
    a clean 404 (no `P2023`/500), and `ParseUUIDPipe` would wrongly reject every
    valid cuid. Adding it would be a bug, so it was intentionally skipped.
  - **Low-severity follow-ups (same branch) — DONE:**
    (7) **Refresh-token pruning** — `mint`/`rotate` delete the user's
    already-expired tokens so the table can't grow unbounded.
    (8) **Typo fix** — `"is has been revoked"` → `"has been revoked"`.
    (9) **Prisma error mapping** — the global exception filter maps P2025 →
    404 and P2002 → 409 (structural type guard, no Prisma class import) instead
    of an opaque 500.
  - **Full write-up + laptop checklist:** see
    `docs/security-hardening-2026-06-08.md`.
  - **Verification:** build, lint, and **38 unit tests (8 suites)** green in the
    cloud container, plus a throwaway DI-compile smoke test (AppModule resolves
    with the throttler guard wired). **e2e NOT run here** — needs Docker Postgres
    on 5433; run `cd apps/api && npm run test:e2e` locally. Note: incremental
    `npm install <pkg>` breaks Jest's ts-jest resolution in this container; a
    clean `npm ci` restores it (always `npm ci` after pulling).
  - **Merged to `main`** locally and pushed (see security doc for the commit
    range); branch `claude/api-security-hardening` retained.
- Nothing actively mid-task. Phase 5 is complete on branch
  `phase-5-maps-integration` (not yet merged to `main`). **Next up: Phase 6 —
  Recommendation Engine & Assignments** (eligibility + scoring + assignment
  creation, consuming `MapsService`).

## Next Up

- Phase 6 — Recommendation Engine & Assignments. Per
  `docs/implementation-plan.md` Phase 6: eligibility rules (spec §7 stage 1)
  and the six scoring factors as pure, tested functions (weights from config);
  `RecommendationsModule` (`GET /deliveries/:id/recommendations`, persisting
  `RecommendationRun`/`RecommendationCandidate` incl. ineligible reasons);
  `AssignmentsModule` (`POST /deliveries/:id/assignments` re-validating
  eligibility, unassign, history — transactional, audited). `routeProximity`/
  `deadlineFit` consume `MapsService.getRouteEstimate` and must degrade to
  zone-based proximity when it returns `null`, flagging that in the
  explanation.

## Open Questions

- ~~Refresh-token strategy~~ **Resolved (2026-06-03):** access + short-lived
  refresh with rotation. Short access token (~15m), longer refresh (~7d),
  `POST /auth/refresh` rotates, `POST /auth/logout` invalidates. FE does
  silent refresh on 401 via the axios interceptor (Phase 7/8).
- Deployment target not yet chosen (see `docs/implementation-tools.md`
  "Deployment" — decision deferred until after MVP feature-complete).
- Pagination style: offset vs. cursor (default offset for MVP simplicity).

## Architecture Decisions

- Backend-first: API + OpenAPI contract is the primary deliverable; React is
  a demo client. (Reason: portfolio emphasis on backend engineering.)
- PostgreSQL + Prisma chosen over TypeORM/Mongo for relational fit + clean
  DX. (Reason: strongly relational domain, readable schema/migrations.)
- Contract-first: NestJS Swagger → OpenAPI → Orval-generated FE client.
  (Reason: demonstrates a real contract-first workflow; eliminates type
  drift.)
- OpenRouteService behind a `maps` adapter interface. (Reason: testability +
  graceful degradation + avoids heavy billing setup.)
- Scoring engine is deterministic + explainable, no ML. (Reason: testable,
  reviewable, honest about scope.)
- Live driver tracking deferred to v2; architecture leaves room for it.
- Auth uses access + short-lived refresh tokens with rotation (decided
  2026-06-03). Reason: demonstrates real session security (rotation +
  revocable refresh) over an access-only shortcut, at modest added scope.
- API URL versioning (decided 2026-06-06): all business routes under `/v1`
  via NestJS URI versioning (global `defaultVersion: '1'`); `health`/`docs`
  version-neutral; major-only URL, v2 only on breaking contract changes.
  Spec: `docs/superpowers/specs/2026-06-06-api-url-versioning-design.md`.

## Session Notes

- Stack locked: React + TS (Vite) frontend, NestJS backend, PostgreSQL +
  Prisma, JWT auth with roles admin/dispatcher/driver/viewer, Swagger +
  Orval, OpenRouteService, TanStack Query.
- Monorepo via npm workspaces, unishare-style `apps/*` + `packages/*` layout
  (`apps/api` = `@logidash/api`, `apps/web` = `@logidash/web`,
  `packages/api-client` = `@logidash/api-client`); project lives at `~/logidash`.
- Scaffold versions (generators pulled latest): backend NestJS 11 / ESLint 9 /
  TS 5.7; frontend React 19 / Vite 8 / ESLint 10 / TS 6. Divergent ESLint/TS
  majors → ESLint configured per-package (see implementation-tools.md).
  Backend env validated with Zod (`zod@^3`).
- Docker note: Postgres runs via Docker Compose on host port **5433** (not 5432) to avoid conflicting with a locally installed PostgreSQL service.
  Start Docker Desktop then `docker compose up -d` before migrate/seed.
- Git: Phase 2 committed and pushed to `origin/main` (`9170144`).
- Testing with Prisma 7 under Jest requires two things (already wired): a
  `moduleNameMapper` of `^(\.{1,2}/.*)\.js$ → $1` in the jest config, and
  `NODE_OPTIONS=--experimental-vm-modules` (via `cross-env`) so the WASM query
  compiler's dynamic `import()` works. Any future suite that boots a
  Prisma-backed module (e.g. the Phase 3 role-matrix e2e) needs Docker Postgres
  up on 5433 and inherits this config — no extra setup.
- **2026-06-05:** reconciled this tracker with reality — it had said Phase 3
  was not started, but Tasks 1–6 were already committed (before the monorepo
  restructure). Baseline re-verified green on the current tree: `build`, `lint`
  (no changes), unit (4 suites / 13 tests), and e2e (1 suite / 1 test — health
  only; auth e2e is Task 10). Docker Postgres confirmed up on 5433.
- **2026-06-05 (restructure):** moved backend domain modules under
  `src/modules/` — `apps/api/src/{auth,users}/` →
  `apps/api/src/modules/{auth,users}/` (per-file `git mv`, history preserved);
  `common/`, `config/`, `prisma/`, `health/` stay at `src/` root. Relative
  imports gained one `../` level. Re-verified green: build, lint (no changes),
  unit (13), e2e (1). Synced `architecture.md`, `code-standards.md`, the design
  spec, this tracker, and the Phase 3 plan to the `modules/` layout.
- **2026-06-05 (Phase 3 finish):** auto-implemented Tasks 7–11 on branch
  `phase-3-auth-finish` (one commit per task) — auth DTOs/service/strategy/
  controller, global `JwtAuthGuard` + `RolesGuard` wiring, Swagger bearer
  scheme, and the role-matrix/token-flow e2e. Verified green: build, lint,
  unit (19 tests / 6 suites), e2e (8 tests / 2 suites). Docker Postgres on 5433. Phase 3 complete; ready to merge `phase-3-auth-finish` → `main`.
- **2026-06-06 (API URL versioning):** added NestJS URI versioning so all
  business routes are served under `/v1` (no `/api` prefix), via global
  `defaultVersion: '1'` in `main.ts`; `health` marked `VERSION_NEUTRAL` and the
  Swagger `docs` mount is naturally outside the versioned router. Governance
  policy (major-only URL, v2 only on breaking changes, `info.version`
  independent) captured in design spec
  `docs/superpowers/specs/2026-06-06-api-url-versioning-design.md` and the
  approved plan under `docs/superpowers/plans/`. The auth e2e applies the same
  `enableVersioning` config in its own `beforeAll` (the test builds its own Nest
  app and does not run `main.ts`) and now asserts a bare business path 404s —
  proving versioning is enforced, not cosmetic. Verified green: build, lint,
  unit (19 / 5 suites), e2e (9 / 2 suites). Fast-forward merged to `main`
  (`e55af59`); not yet pushed to origin.
- **2026-06-07 (Phase 4 Slice 1 — Zones + Vehicles):** resumed the slice on a
  dedicated branch `phase-4-slice-1-zones-vehicles`. Task 3 (Zones) built
  teach-and-build (DTOs → service spec red→green → service → controller →
  module → wire); Tasks 4–6 (Vehicles, e2e, docs) auto-executed at the user's
  request. Commits: `feat(zones)…`, `fix(zones): normalize module filename`,
  `feat(vehicles)…`, `test(api): e2e for zones/vehicles…`, plus this docs sync.
  Two deviations from the plan: (a) the hand-typed Zones module file was named
  `zone.module.ts` (singular) — renamed to match the `zones.*` siblings;
  (b) the e2e's `expect.any(String)` tripped the strict
  `@typescript-eslint/no-unsafe-assignment` rule (the pre-commit hook reverted
  the commit) — replaced with a typed `res.body` cast + `typeof` assertions,
  matching the auth e2e style. Verified green: build, lint, unit, and 17 e2e
  (3 suites). Docker Postgres on 5433. Fast-forward merged to `main` locally
  (`807fc14`); branch kept, not yet pushed to origin.
- **2026-06-10 (Phase 5 — Maps Integration):** executed the 7-task plan on
  branch `phase-5-maps-integration` (one commit per task): env+contract →
  mock provider → ORS provider → MapsService/MapsModule → delivery geocoding →
  e2e → docs. Execution notes: (a) `jest.Mocked<MapsProvider>` typing in
  `maps.service.spec.ts` tripped `@typescript-eslint/unbound-method` on
  `expect(provider.route)` — switched to an inferred `jest.fn()` object (the
  same pattern as the prisma mocks), after which the explicit
  `as MapsProvider` cast tripped `no-unnecessary-type-assertion` (the mock is
  structurally assignable) and was dropped; (b) mixing the rounded-coords
  object typed as `Prisma.DeliveryUpdateInput` into an update that also writes
  the scalar `zoneId` FK broke Prisma's checked/unchecked XOR — typed it
  `Prisma.DeliveryUncheckedUpdateInput` instead. e2e ran against Docker
  Postgres on 5433; full suite green (96 unit / 27 e2e).
- **2026-06-08 (Phase 4 Slice 2 — Drivers + Deliveries + Audit):** auto-executed
  the 7-task plan on branch `phase-4-slice-2-drivers-deliveries-audit` (one
  commit per task): audit service → drivers → status machine → deliveries CRUD →
  status endpoint → e2e → docs. Two execution notes: (a) the Task-5 spec's
  `makePrismaMock` self-references `prisma` inside its own object initializer for
  the interactive-`$transaction` branch — written inline that makes TS infer the
  mock as `any` (tripping `no-unsafe-*`); fixed by initializing `$transaction:
jest.fn()` and wiring its `mockImplementation` **after** construction so the
  mock keeps a concrete type. (b) The e2e `afterAll` cleanup first failed on
  `AuditLog_actorUserId_fkey` — status-change audit rows reference the test users
  as actors, so deleting users by email is blocked; fixed by deleting audit rows
  via `actor: { email: { in: … } }` before the users. e2e was run against a
  locally-spun PostgreSQL 16 cluster on **5433** (Docker daemon unavailable in
  this container — used `/usr/lib/postgresql/16/bin` `initdb`/`pg_ctl` as the
  `postgres` system user, then `prisma migrate deploy`). Verified green: build,
  lint, 60 unit (12 suites), 24 e2e (4 suites). **Phase 4 core domain complete.**
