# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 1 — Foundation & Monorepo Scaffold: **complete**. Running NestJS API
  and React app in an npm-workspace monorepo, with lint, validated env config,
  Docker Postgres definition, and a `GET /health` endpoint.

## Current Goal

- Begin Phase 2 — Database Schema & Prisma: add Prisma, model all spec §6
  entities (enums/relations/indexes + RouteEstimate cache-key constraint),
  create the initial migration, add `PrismaModule`/`PrismaService`, and seed.

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

## In Progress

- None (Phase 1 complete; ready to start Phase 2).

## Next Up

- Phase 2 — Database Schema & Prisma (see implementation plan). Backend leads;
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
- Docker note: the Docker CLI is installed but the Docker Desktop daemon was
  **not running** during Phase 1 (engine pipe absent), so live Postgres
  reachability was not verified. `docker compose config` validates the file;
  start Docker Desktop then `docker compose up -d` to bring up Postgres.
- Git is now working (repo on `main` with the docs commit). Phase 1 scaffold
  is uncommitted in the working tree — commit when ready (branch first if a PR
  flow is desired).
