# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 4 — Core Domain Modules (Drivers, Vehicles, Zones, Deliveries):
  **in progress — Slice 1 underway (teach-and-build).** Slice 1 = Foundations +
  Zones + Vehicles; plan at
  `docs/superpowers/plans/2026-06-06-phase-4-slice-1-foundations-zones-vehicles.md`.
  Done so far: **Task 1** global exception filter (`common/filters/`, registered
  via `APP_FILTER`) and **Task 2** offset pagination envelope (`common/` query +
  meta DTOs, `paginate()`/`toSkipTake()` helpers, `@ApiPaginatedResponse()`
  decorator) — both verified green (build + lint). **Next: Task 3 ZonesModule**,
  then Vehicles, e2e, docs. Drivers/Deliveries (status graph) + Audit are later
  slices.
- Phase 3 — Auth & Authorization: **complete (11/11 tasks).** JWT access +
  rotating refresh tokens (hashed, reuse-detected), four-role authorization
  via global `JwtAuthGuard` → `RolesGuard` with `@Public()` opt-out, admin
  `UsersModule`, Swagger bearer scheme, and a role-matrix/token-flow e2e —
  all green. Code under `apps/api/src/modules/{auth,users}` + `src/common`.
- Phase 2 — Database Schema & Prisma: **complete**. Full relational model via
  Prisma 7, initial migration, NestJS `PrismaModule`/`PrismaService`, and
  reproducible demo seed (`npm run db:seed`).

## Current Goal

- Begin Phase 4 — Core Domain Modules. Start with `ZonesModule` /
  `VehiclesModule` CRUD (role-gated), then `DriversModule` and
  `DeliveriesModule` (status-transition graph), `AuditModule`, plus the global
  exception filter + offset pagination envelope deferred from Phase 3.
- API routes are now URL-versioned under `/v1` (landed 2026-06-06, on `main`):
  NestJS URI versioning with global `defaultVersion: '1'`; `health`/`docs`
  version-neutral. New Phase 4 controllers inherit `/v1` automatically — no
  per-controller version decorator needed.

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

- Phase 4 — Slice 1 (Foundations + Zones + Vehicles), teach-and-build. **Tasks
  1–2 done** (global exception filter + pagination envelope, both green); **Tasks
  3–6 remaining** (ZonesModule → VehiclesModule → e2e → docs). Full per-task code
  in the Slice 1 plan doc under `docs/superpowers/plans/`.

## Next Up

- Phase 4 — Core Domain Modules (Drivers, Vehicles, Zones, Deliveries). Per
  `docs/implementation-plan.md` Phase 4: start with `ZonesModule` /
  `VehiclesModule` CRUD (role-gated), then `DriversModule` and
  `DeliveriesModule` (spec §8 status-transition graph), `AuditModule`, plus the
  global exception filter + offset pagination envelope deferred from Phase 3.
  New domain modules go under `apps/api/src/modules/<domain>/`. Backend leads;
  no frontend work until the contract exists.

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
