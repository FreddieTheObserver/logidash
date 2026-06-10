# Implementation Tools & Decisions

Concrete tooling choices for logidash. Each entry gives the decision, the
reason, and (where relevant) alternatives considered. These are defaults;
anything marked "confirm in Phase X" is revisited during that phase.

## Monorepo & Tooling

- **pnpm workspaces** for the monorepo, laid out as `apps/*` + `packages/*`
  (`apps/api`, `apps/web`, `packages/api-client`).
  - Reason: pnpm records platform-specific native optional dependencies for
    every architecture in one committed lockfile (`supportedArchitectures` in
    `pnpm-workspace.yaml`), so `pnpm install --frozen-lockfile` is reproducible
    across local Windows, Linux CI, and macOS. npm cannot express this in a
    single lockfile (npm/cli#4828), which broke cross-platform CI on Vite 8 /
    Rolldown's per-OS prebuilt binary. pnpm's content-addressed store is also
    faster and disk-efficient. Build scripts are allowlisted via
    `onlyBuiltDependencies` (pnpm 10 blocks them by default).
  - Migrated from npm workspaces during CI setup (2026-06-10). Alternatives:
    npm workspaces (frictionless, but the lockfile is single-platform),
    Turborepo/Nx (overkill at this size).
- **Node**: LTS (>= 20).
- **Language**: TypeScript everywhere, `strict: true`.
- **Lint/format**: Prettier + `.editorconfig` are shared at the repo root
  (single `.prettierrc`, single `.prettierignore`). ESLint is configured
  **per package** via flat config — the generated backend (NestJS 11, ESLint 9,
  TS 5.7) and frontend (Vite, ESLint 10, TS 6) sit on different ESLint/TS
  majors, so a single shared ESLint base is impractical; each package keeps a
  ruleset tuned to its stack (Node/Nest type-checked rules vs React/JSX rules).
  Root `pnpm format` / `pnpm format:check` run Prettier across the whole repo.
- **Git hooks**: Husky + lint-staged (lint/format on commit). Optional;
  added in Phase 1.

## Backend (NestJS)

- **Framework**: NestJS (latest) generated via Nest CLI.
- **HTTP layer**: Express adapter (default) — well-trodden, fine for this
  scope. (Fastify is a possible later optimization; not needed.)
- **ORM**: Prisma + `@prisma/client`. PostgreSQL provider.
- **DB (local dev)**: PostgreSQL 16 via Docker Compose.
- **Validation**: `class-validator` + `class-transformer` with a global
  `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- **Config**: `@nestjs/config` with a validated env schema (zod or
  class-validator) so missing/invalid env fails fast at boot.
- **API docs / contract**: `@nestjs/swagger`; emit `openapi.json` as a build
  artifact (script: generate spec without starting the full server when
  feasible).
- **Auth**:
  - `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`.
  - Password hashing: **argon2** (fallback bcrypt if argon2 native build is
    troublesome on the target machine).
  - Strategy: short-lived access token for MVP; **access + rotating refresh
    token** is the intended target — confirm in Phase 3.
  - Authorization: custom `@Roles()` decorator + `RolesGuard`.
- **Maps integration**: OpenRouteService via a `MapsProvider` interface.
  - Concrete `OrsMapsProvider` using **native `fetch`** (Node ≥ 20 — no axios
    dependency on the backend) against ORS Pelias geocoding
    (`/geocode/search`) + directions (`/v2/directions/driving-car`);
    per-request timeout via `AbortSignal.timeout(ORS_TIMEOUT_MS)`; failures
    mapped to a typed `MapsProviderError` (`timeout | http | network`).
  - `MockMapsProvider` for tests/local-without-key: deterministic FNV-1a hash
    geocode around a fixed city center + haversine-based route estimates.
  - Provider selected by env: `MAPS_PROVIDER=ors|mock`; when unset, `ors` if
    `ORS_API_KEY` is non-empty, else `mock`. Tests force `mock` (no network).
  - Results cached in `RouteEstimate` (read-through, 4-decimal
    rounded-coordinate cache key, upsert to absorb concurrent misses).

## Frontend (React)

- **Build tool**: **Vite** + React + TypeScript.
  - Reason: fast, simple, ideal for an SPA demo client.
- **Routing**: React Router (data router APIs) with role-aware route guards.
- **Server state**: **TanStack Query**, driven by Orval-generated hooks.
- **API client generation**: **Orval**.
  - Mode: `react-query` client targeting the backend `openapi.json`.
  - HTTP client: axios instance (`frontend/src/lib/http.ts`) with auth-token
    interceptor; Orval `mutator` points at it.
  - Output: `packages/api-client/src/generated/` (shared `@logidash/api-client`
    package, consumed by `apps/web`; regenerated via script, not hand-edited).
- **UI-only state**: React state by default; **Zustand** only where a small
  amount of cross-component UI state genuinely helps (e.g. global filters).
- **UI primitives**: **Tailwind CSS** + **shadcn/ui** (Radix-based headless
  components).
  - Reason: fast to build a clean, accessible command-center UI; tokens map
    cleanly onto the variables in `ui-context.md`.
  - Components must consume the `ui-context.md` tokens, not raw Tailwind
    palette values, for status/semantic colors.
- **Charts** (dashboard, light use): Recharts (added only if needed).
- **Forms**: React Hook Form + zod resolver; field errors mapped from the
  API `400 details` shape.

## Testing

- **Backend unit**: Jest (Nest default) — scoring factors, eligibility,
  status-transition logic, services with mocked Prisma.
- **Backend e2e**: Jest + Supertest against a test app; PostgreSQL test DB
  (Docker) or a disposable schema; seed/teardown per suite.
- **Maps**: `MockMapsProvider` covering success / failure-timeout /
  cache-hit; no real network in tests.
- **Frontend**: Vitest + React Testing Library for key components/hooks
  (lightweight — backend is the test focus). Optional Playwright smoke test
  for the core flow (stretch).
- **Coverage emphasis**: domain core (recommendations, assignments, auth/
  roles) over breadth.

## Local Dev & Ops

- **Docker Compose**: PostgreSQL (and pgAdmin optional). App runs on host in
  dev; containerizing the apps is a stretch.
- **Env management**: `.env` per package + committed `.env.example`.
  Key vars: `DATABASE_URL`, `JWT_SECRET` (+ refresh secret if used),
  `MAPS_PROVIDER`, `ORS_API_KEY`, `ORS_BASE_URL`, `ORS_TIMEOUT_MS`, `PORT`,
  `FRONTEND_ORIGIN` (CORS).
- **Scripts** (root): `dev`, `build`, `lint`, `test`, `gen:openapi`,
  `gen:client` (Orval), `db:migrate`, `db:seed`.
- **Seed**: Prisma seed script creating demo accounts (one per role), zones,
  drivers, vehicles, and deliveries for a reproducible demo.

## Deployment (deferred — confirm post-MVP)

- Likely targets: backend on Railway/Render/Fly.io with managed Postgres
  (Neon/Supabase/Railway PG); frontend on Vercel/Netlify/static host.
- Decision deferred until MVP is feature-complete (tracked as an open
  question in `progress-tracker.md`).

## Decision Log (summary)

| Area            | Decision                           | Key reason                          |
| --------------- | ---------------------------------- | ----------------------------------- |
| Monorepo        | pnpm workspaces                    | Cross-platform native-dep lockfile  |
| DB / ORM        | PostgreSQL + Prisma                | Relational fit, clean DX/migrations |
| Auth            | JWT + Passport, argon2, RolesGuard | Stateless, role-based, standard     |
| Contract        | NestJS Swagger → Orval client      | True contract-first, no type drift  |
| FE server state | TanStack Query (via Orval)         | Caching/invalidation done right     |
| FE UI           | Vite + Tailwind + shadcn/ui        | Fast, accessible, token-friendly    |
| Maps            | OpenRouteService behind adapter    | Testable + graceful + no heavy bill |
| Tests           | Jest + Supertest (BE), Vitest (FE) | Backend-focused credibility         |
