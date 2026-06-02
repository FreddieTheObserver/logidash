# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 2 — Database Schema & Prisma: **complete**. Full relational model via
  Prisma 7, initial migration, NestJS `PrismaModule`/`PrismaService`, and
  reproducible demo seed (`npm run db:seed`).

## Current Goal

- Begin Phase 3 — Auth & Authorization: login endpoint, JWT issuance, role
  guards, and e2e tests proving role differences.

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

## In Progress

- None (Phase 2 complete; ready to start Phase 3).

## Next Up

- Phase 3 — Auth & Authorization (see implementation plan). Backend leads;
  no frontend work until the contract exists.

## Open Questions

- Refresh-token strategy: access-token-only vs. access+refresh rotation
  (default leans access+short-lived refresh; confirm during Phase 3 auth).
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

## Session Notes

- Stack locked: React + TS (Vite) frontend, NestJS backend, PostgreSQL +
  Prisma, JWT auth with roles admin/dispatcher/driver/viewer, Swagger +
  Orval, OpenRouteService, TanStack Query.
- Monorepo via npm workspaces; project lives at `~/logidash`.
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
