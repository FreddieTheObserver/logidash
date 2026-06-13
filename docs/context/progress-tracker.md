# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 8 — Frontend Command Center, Slice 1 (Foundations + Auth): **COMPLETE
  (16/16 tasks, 2026-06-13)** on branch `phase-8-slice-1-foundations-auth` (not
  merged) — the first real UI consumption of the generated `@logidash/api-client`
  hooks. Shipped: **Tailwind 4** (`@tailwindcss/vite`) with the `--color-*`
  palette in `@theme` + the remaining tokens (`--tint-*`, shadows, radii, fonts)
  and util styles (`.tnum`, focus rings, `.skeleton`, `.animate-fade`,
  reduced-motion) in `styles/base.css`; a hand-built **typed primitive library**
  (`components/ui/`: Chip family + ScoreChip, Button, Card, Avatar, Skeleton,
  Meter, EmptyState, ErrorState, Field/Input/Select, Toast, Menu — Menu closes on
  outside-click **and** Escape) using a `lucide-react` icon name map and pure
  `lib/tone.ts` / `lib/format.ts` helpers; **React Router v7** with a role-aware
  `ProtectedRoute` (loading splash, unauth → `/login`, wrong-role → `/`),
  `PublicOnly` `/login`, and `RouteStub` placeholders for the Slice 2–3 screens;
  `AppProviders` (QueryClientProvider + `AuthProvider` resolving `/v1/auth/me`);
  the **command-center shell** (`Sidebar` + `TopBar` + `AppShell`) driven by the
  JWT role from `useAuth()`; and a **real login screen** (`/v1/auth/login` +
  one-click seeded demo accounts; 401/403/5xx → inline messages). `lib/api.ts`
  now wires `onSessionExpired` → hard redirect to `/login`. A **Vitest + RTL**
  harness was added (driving the automatic JSX runtime through esbuild, since
  vitest's bundled Vite 7 doesn't apply `@vitejs/plugin-react@6`). Verified green:
  `lint:check`, `build` (CSS 15.9 kB), **13 unit tests (7 files)**, plus a browser
  smoke (the `/login` route renders and all design tokens resolve). Trimmed gaps
  (logged for later/backend): read-only role chip replaces the prototype's client
  role switcher, a static no-op notifications bell, and nav count badges deferred
  to the slices that own those screens. **Notable fix:** a `*/` sequence inside a
  CSS comment in `tailwind.css` (`bg-*/text-*`) closed the comment early and
  silently dropped the entire `@theme` block — no color tokens or utilities were
  emitted — caught via a browser computed-style check, not the build (which
  passed). Plan:
  `docs/superpowers/plans/2026-06-13-phase-8-slice-1-foundations-auth.md`; spec:
  `docs/superpowers/specs/2026-06-13-phase-8-slice-1-foundations-auth-design.md`.
  **Next: Phase 8 Slice 2 — Critical flow (Deliveries queue → Delivery detail +
  recommendation panel + assign + status).**
- Phase 7 — Contract Emit & Frontend Client Generation: **COMPLETE (13/13
  tasks, 2026-06-11).** The contract-first loop is closed end-to-end. `apps/api`
  gained a shared OpenAPI document builder (`src/openapi/swagger.config.ts`,
  used by both `main.ts`'s `/docs` and the emit script) with an
  `operationIdFactory` (`ZonesController.list` → `zonesList` → `useZonesList`),
  a documented `ErrorResponseDto` + `ApiErrorResponses()` helper mirroring the
  global filter's body, and a **response-schema sweep** adding explicit
  `@ApiOkResponse`/`@ApiCreatedResponse`/`@ApiNoContentResponse` + class/method
  `@ApiErrorResponses(...)` to every endpoint (health DTO-ified). `pnpm
gen:openapi` boots `AppModule` via `NestFactory.create` with placeholder env
  (never `init()`/`listen()`, so Prisma never connects) and writes a **committed**
  `apps/api/openapi.json` (20 paths, bearer scheme, error shapes). `pnpm
gen:client` runs Orval (react-query mode) → typed TanStack Query hooks + models
  in `packages/api-client/src/generated/` (committed), funneled through a
  hand-written axios mutator (`src/http/custom-instance.ts`) that attaches the
  bearer token and does **single-flight silent refresh** on 401 via the Phase 3
  rotation flow, with localStorage token storage (`src/http/token-storage.ts`,
  in-memory fallback). `apps/web` configures the client at startup
  (`src/lib/api.ts`) and type-checks against generated types only. CI's `quality`
  job regenerates both artifacts and **fails on drift**. New root README
  documents the quickstart + contract-first workflow. No schema migration; no API
  behavior change. Verified green: build, lint, format, **160 unit (api, 24
  suites) + 12 unit (api-client, vitest)**, **43 e2e (6 suites)**; `pnpm gen`
  leaves zero drift. Branch `phase-7-contract-and-client-generation`, one commit
  per task. **Next: Phase 8 — Frontend Command Center.**
- Phase 6 — Recommendation Engine & Assignments: **COMPLETE (13/13 tasks,
  2026-06-11).** `modules/recommendations/` ships a pure, fully unit-tested
  engine core (`engine/`: `checkEligibility` hard filters, six scoring factors,
  deterministic score/rank, row→context builders, active-load aggregation,
  haversine/degraded-route helpers) orchestrated by `RecommendationsService`.
  `GET /v1/deliveries/:id/recommendations` returns the latest persisted run or
  computes lazily (admin/dispatcher + delivery `ready`); `?refresh=true` forces
  a fresh run (403 other roles, 409 when not `ready`); 404 when none exists and
  none can be computed. A run persists `RecommendationRun` +
  `RecommendationCandidate` (eligible ranked by score desc, ties by `driverId`;
  ineligible kept with `score 0`/`rank null` + `ineligibleReasons`) + a
  `recommendation.run_created` audit row in one `$transaction`; the
  `inputSnapshot` records `now` + weights + constants so every run is
  reproducible. `modules/assignments/` drives the deferred `ready → assigned`
  edge: `POST /v1/deliveries/:id/assignments` `{ driverId, reason? }` re-runs
  the **same** `checkEligibility` (one rulebook), then in one `$transaction`
  status-guard-flips the delivery (`updateMany where status=ready` → 409 on lost
  races, no double-assign), creates the active `Assignment` bound to the
  driver's linked vehicle, increments `activeJobCount`, and writes
  `assignment.created` + `delivery.status_changed` audit rows. History at
  `GET /v1/deliveries/:id/assignments` and `GET /v1/drivers/:id/assignments`
  (paginated, newest first). Route-dependent factors degrade to zone-distance
  estimates flagged `degraded` when `MapsService.getRouteEstimate` returns
  `null`. No schema migration (all tables shipped in Phase 2). Verified green:
  build, lint, **151 unit (23 suites)**, **43 e2e (6 suites)**. Branch
  `phase-6-recommendations-assignments`. **Next: Phase 7 — Contract Emit &
  Frontend Client Generation.**
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

- **Phase 8 — Frontend Command Center** is underway, built in 3 vertical slices.
  **Slice 1 (Foundations + Auth) is done** (see Current Phase): tokens + Tailwind
  4, the primitive library, providers, role-aware router/guards, the app shell,
  and a working login flow are live on `phase-8-slice-1-foundations-auth`. The
  remaining gap before merge is the **live login → shell → sign-out smoke against
  a booted API** (needs Postgres on 5433 + seed; the static suite + a
  backend-less browser smoke are green). **Next: Slice 2 — Critical flow**
  (Deliveries queue → Delivery detail + recommendation panel + assign + status),
  which delivers the phase's create→recommend→assign→status "Done when". Slice 3
  (Dashboard, Drivers, Admin) follows.
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
- **Phase 6 — Recommendation Engine & Assignments — complete (13/13):**
  - Task 1: branch `phase-6-recommendations-assignments` from `main`; saved the
    plan and locked the §7 clarifications into the design spec (size-tier compat
    matrix, priorityFit formula, GET-latest/refresh semantics, `{ driverId }`
    body, weights-in-config + snapshot, ineligible `score 0`/`rank null`,
    captured-`now` determinism). Landed as two commits (plan + spec).
  - Task 2 engine contracts: `engine/types.ts` (FactorName/Weights/contexts as
    type aliases), `engine/weights.ts` (`DEFAULT_WEIGHTS` summing to 1,
    `SCORING_CONSTANTS`, `COMPATIBLE_PACKAGE_SIZES`, `RECOMMENDATION_WEIGHTS` DI
    token) + spec.
  - Task 3 `engine/geo.ts`: `haversineKm` + `estimateRouteFallback`
    (straight-line × 1.3 road factor at 30 km/h) + spec.
  - Task 4 `engine/eligibility.ts`: spec §7 stage-1 hard filters (availability /
    vehicle present+active / size compat / remaining weight capacity / workload
    max), collecting **every** failing reason + spec.
  - Task 5 `engine/factors.ts`: the six scoring factors as pure
    `(…) → { value, reason, degraded? }`, with the tiered
    ORS→estimate→neutral degradation on `routeProximity`/`deadlineFit` + spec.
  - Task 6 `engine/score.ts`: `scoreCandidate` (weighted = rawValue×weight×100
    @1dp; score = Σweighted @2dp) + `rankCandidates` (score desc, ties by
    `driverId` asc → total order) + spec.
  - Task 7 `engine/context.ts` + `engine/active-load.ts`: row→context builders
    (Decimal→`Number`, null-safe coords) and `activeLoadsByDriver` (Σ
    packageWeight of active assignments) — shared by both services + spec.
  - Task 8 `RecommendationsService`: loads delivery+drivers+loads, runs
    eligibility first then route lookups only for eligible drivers, scores +
    ranks, persists run+candidates+audit in one `$transaction`, and serves the
    latest-or-computes DTO + 8-test service spec.
  - Task 9 `RecommendationsController` + module + `AppModule` wiring:
    `GET /v1/deliveries/:id/recommendations` (read open to any role; compute
    gating lives in the service).
  - Task 10 `AssignmentsService`: transactional `create` (re-check eligibility →
    status-guarded flip → `Assignment` + workload bump + two audit rows) and
    paginated `listByDelivery`/`listByDriver` + 9-test service spec.
  - Task 11 `AssignmentsController` + module + wiring:
    `POST /v1/deliveries/:id/assignments`, `GET /v1/deliveries/:id/assignments`,
    `GET /v1/drivers/:id/assignments`.
  - Task 12 e2e (`test/recommendations-assignments.e2e-spec.ts`, 16 tests):
    recommend→assign happy path with ranked + explained candidates, ineligible
    driver kept with reasons, ineligible-assignment 409, double-assign race 409,
    role gating, and assignment history.
  - Task 13: docs sync (this tracker + `implementation-plan.md`).
  - Verified green: build, lint, **151 unit (23 suites)**, **43 e2e
    (6 suites)**. Branch `phase-6-recommendations-assignments`, one commit per
    task.
- **Phase 7 — Contract Emit & Frontend Client Generation — complete (13/13):**
  - Task 1: branch `phase-7-contract-and-client-generation` from `main`; saved
    the plan.
  - Task 2 shared OpenAPI builder: `src/openapi/swagger.config.ts`
    (`createOpenApiDocument(app)` + `operationIdFactory`), consumed by `main.ts`
    so served `/docs` and emitted contract can't drift.
  - Task 3 error contract: `common/dto/error-response.dto.ts` (`ErrorResponseDto`,
    mirrors the filter's body) + `common/decorators/api-error-responses.decorator.ts`
    (`ApiErrorResponses(...statuses)`, method **and** class decorator).
  - Task 4 response-schema sweep: `AuthUserDto` (4 fields — matched the real
    `AuthUser`, not the plan's 3), `HealthStatusDto`, and explicit response +
    error decorators on every controller/endpoint (class-level
    `@ApiErrorResponses(401)`, users `(401, 403)`). Metadata-only; 160 unit green.
  - Task 5 emit script + artifact: `src/openapi/generate-openapi.ts` + `gen:openapi`.
    **Deviation:** the plan's `tsx` runner can't boot NestJS — esbuild drops
    `emitDecoratorMetadata` so type-based DI (e.g. `MapsService`'s `PrismaService`)
    resolves to `undefined`; switched to `nest build && node dist/...` (real tsc
    metadata). Also added `abortOnError:false` (else a boot failure calls
    `process.exit` silently) and `.js` extensions on the dynamic imports (nodenext).
    Removed a pre-existing `.gitignore` rule that ignored `openapi.json`
    (contradicted the committed-artifact decision); added both artifacts to
    `.prettierignore`. Emits **20 paths**.
  - Task 6 toolchain: `orval`, `vitest`, `axios`, `@tanstack/react-query`
    (devDeps) + axios/react-query as **peerDependencies**; `orval.config.ts`
    (tags-split, react-query, axios, custom mutator).
  - Task 7 token storage (TDD): `src/http/token-storage.ts` — localStorage with
    in-memory fallback, corrupted-JSON → logged out. 5 tests.
  - Task 8 axios mutator (TDD): `src/http/custom-instance.ts` — bearer attach +
    single-flight rotate-and-retry on 401 (skips `/auth/*`, retries once). 7
    tests. Spec's `makeAdapter` retyped to `AxiosAdapter`/`InternalAxiosRequestConfig`
    to satisfy TS 6 + axios typings.
  - Task 9 generate + exports: `pnpm gen:client` → Orval output (9 tag endpoint
    files + model barrel); `src/index.ts` re-exports the http layer + generated
    model/endpoints. typecheck + 12 vitest green.
  - Task 10 web wiring: `apps/web` gains `axios`, `@tanstack/react-query`, and the
    `@logidash/api-client` workspace dep; `src/lib/api.ts` calls
    `configureHttpClient` at startup (imported first in `main.tsx`); created
    `vite-env.d.ts` (typed `VITE_API_URL` — standardized the env var name, was
    `VITE_API_BASE_URL` in `.env.example`). `tsc -b` + vite build green.
  - Task 11 CI drift check: `quality` job runs `gen:openapi` + `gen:client` then
    `git diff --exit-code` on both artifacts (no DB/secrets — the emit script
    self-provides placeholder env).
  - Task 12 README: root README extended (it already existed, contrary to the
    plan) with Quickstart, the contract-first workflow diagram + rules, and a
    scripts table.
  - Task 13: full verification + docs sync (this tracker, `implementation-plan.md`,
    `implementation-tools.md`). Also added `.cursor/` to `.gitignore`/`.prettierignore`.
  - Verified green: build, lint, format, **160 unit (api) + 12 unit
    (api-client)**, **43 e2e (6 suites)**; `pnpm gen` → zero drift. Branch
    `phase-7-contract-and-client-generation`, one commit per task.
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

- Phase 8 Slice 2 — Critical flow. On the Slice 1 foundation, build the
  **Deliveries queue** (filters, status/priority chips, pagination, and the four
  loading/empty/error/data states via `useDeliveriesList`) and the **Delivery
  detail** screen — info card, the signature **recommendation panel** (ranked
  candidates with the expandable per-factor breakdown via
  `useRecommendationsGetForDelivery`), the **assign** confirm-modal flow
  (`assignmentsCreate`, surfacing the server's 409 inline), and the **status
  transition** controls (`deliveriesChangeStatus` along the allowed graph). This
  delivers the phase's create→recommend→assign→status "Done when". Resolve the
  zone-code lookup (via `zonesList`) and log the remaining trimmed gaps
  (assigned-driver column, route-estimate strip, audit timeline) as that slice's
  spec is written.

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
- **2026-06-10 (Phase 5 verification + e2e hardening):** re-verified Phase 5 on
  branch `phase-5-maps-integration` against the live tree — lint clean, build
  ok, **96 unit (16 suites)** and **27 e2e (5 suites)** green. Found the default
  `pnpm test:e2e` flaked when Jest ran the e2e suites in parallel: each suite
  boots its own Nest app and calls Prisma `$connect()` in `beforeAll`, and the
  concurrent connects blew Jest's 5s hook timeout (2 suites / 15 tests failed
  intermittently; `--runInBand` was always green). Hardened
  `test/jest-e2e.json` with `maxWorkers: 1` (serialize the DB-backed suites —
  the root-cause fix, applies in CI and locally with no flag to remember) plus
  `testTimeout: 30000` (margin for the I/O-heavy hooks on cold starts / slower
  runners). No comment keys in the JSON (they trip `jest-validate` "unknown
  option" warnings). Confirmed stable: 3 consecutive `pnpm test:e2e` runs all
  27/27 green, and faster (~10s vs ~21s thrashing in parallel).
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
- **2026-06-11 (Phase 6 — Recommendation Engine & Assignments):** executed the
  13-task plan on branch `phase-6-recommendations-assignments`, one commit per
  task (engine contracts → geo → eligibility → factors → score/rank → contexts
  → recommendations service → controller/wiring → assignments service →
  assignment endpoints → e2e → docs). Two deviations: (a) Task 4's
  `eligibility.spec.ts` `makeDelivery` factory accepted an `overrides` param it
  never spread — caught by the pre-commit ESLint `no-unused-vars` hook (which
  reverts on non-fixable errors); fixed by spreading `...overrides` to match the
  `makeDriver` sibling (the intended behavior). (b) Task 8's
  `recommendations.service.ts` failed `nest build` with TS2345 — the `.map`
  callback's explicit `Promise<Evaluated>` return type erased the `driverId` the
  `...result` (a `ScoredCandidate`) spread provided at runtime, so the filtered
  `eligible` array no longer satisfied `rankCandidates(ScoredCandidate[])`; fixed
  by declaring `driverId` on `Evaluated`'s eligible branch (type-only, no runtime
  change) in an extra `fix(...)` commit. e2e ran against Docker Postgres on 5433;
  full suite green (**151 unit / 23 suites**, **43 e2e / 6 suites**). Phase 6
  complete; ready to merge `phase-6-recommendations-assignments` → `main`.
- **2026-06-11 (Phase 7 — Contract Emit & Frontend Client Generation):** executed
  the 13-task plan on branch `phase-7-contract-and-client-generation`, one commit
  per task (Tasks 1–3 from a prior session). Key deviations from the plan:
  (a) **gen:openapi runner** — the plan's `tsx` cannot boot the Nest app:
  esbuild does not emit `emitDecoratorMetadata`, so every type-injected
  dependency (first hit: `MapsService`'s `PrismaService`) resolves to
  `undefined`. ts-node honored the metadata but then tripped on Prisma 7's
  `.js`-extension imports (which jest only resolves via its `moduleNameMapper`).
  Settled on `nest build && node dist/src/openapi/generate-openapi.js` — reuses
  the known-good tsc pipeline; added `abortOnError:false` (NestFactory otherwise
  calls `process.exit` on a boot error, swallowing it under `logger:false`) and
  `.js` extensions on the dynamic imports for nodenext. (b) A pre-existing
  `.gitignore` rule ignored `apps/api/openapi.json`, contradicting the
  committed-artifact decision — removed it; both artifacts now sit in
  `.prettierignore` only. (c) `AuthUserDto` needed 4 fields (`id`, `email`,
  `name`, `role`), not the plan's 3 — matched the real `AuthUser`. (d) The root
  README already existed (plan said it didn't) — extended it instead of creating.
  (e) Standardized the web env var on `VITE_API_URL` (the existing `.env.example`
  used `VITE_API_BASE_URL`, consumed nowhere). (f) The custom-instance spec's
  mock adapter needed retyping to `AxiosAdapter`/`InternalAxiosRequestConfig` for
  TS 6 + the resolved axios typings. Orval (v8.16.0) emitted clean tags-split
  output; `export *` from model + endpoint barrels had no name collisions.
  e2e ran against Docker Postgres on 5433; full suite green (**160 unit (api) +
  12 unit (api-client)**, **43 e2e / 6 suites**), and `pnpm gen` produces zero
  drift. Phase 7 complete; ready to merge → `main`.
