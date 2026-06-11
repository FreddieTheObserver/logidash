# logidash

[![CI](https://github.com/FreddieTheObserver/logidash/actions/workflows/ci.yml/badge.svg)](https://github.com/FreddieTheObserver/logidash/actions/workflows/ci.yml)

A backend-first **Logistics Dispatch API Platform** built with NestJS (backend)
and React + TypeScript (frontend). The core is a PostgreSQL/Prisma data model, a
role-based auth surface, and a **deterministic, explainable** driver
recommendation engine; a React command-center demo client consumes the API
through a fully generated, type-safe contract.

## Monorepo layout

This repository is a pnpm-workspace monorepo (`apps/*`, `packages/*`):

- `apps/api/` — NestJS API (PostgreSQL + Prisma, contract-first OpenAPI,
  role-based auth, scoring-based driver recommendation engine, OpenRouteService
  integration)
- `apps/web/` — React + TypeScript dispatcher command-center UI (consumes the
  Orval-generated client from the API contract)
- `packages/api-client/` — the generated contract client: a hand-written axios
  layer (bearer attach + silent refresh) plus Orval-generated TanStack Query
  hooks and models in `src/generated/`
- `docs/` — project context, design spec, and implementation plan
- `design_handoff_command_center/` — command center UI handoff (`README.md` +
  interactive `prototype/` reference)

## Quickstart

```bash
# 1. Start PostgreSQL (exposed on host port 5433)
docker compose up -d

# 2. Install workspace dependencies
pnpm install

# 3. Configure the API (set a JWT_SECRET of at least 32 characters)
cp apps/api/.env.example apps/api/.env
#   generate one with: openssl rand -base64 32

# 4. Apply migrations and seed demo data
pnpm db:migrate
pnpm db:seed      # demo accounts below — password for all: Demo123!

# 5. Run both apps
pnpm dev          # API on :3000, web on :5173, Swagger UI at http://localhost:3000/docs
```

Seeded demo accounts (all share the password `Demo123!`):
`admin@logidash.dev`, `dispatcher@logidash.dev`, `viewer@logidash.dev`, and
three drivers (`driver.alex`, `driver.sam`, `driver.jordan`).

## Contract-first workflow

The frontend never hand-writes API types. The NestJS controllers + DTOs are the
single source of truth; everything downstream is generated from them:

```
NestJS controllers + DTOs (@nestjs/swagger decorators)
     │  pnpm gen:openapi
     ▼
apps/api/openapi.json                  (committed contract artifact)
     │  pnpm gen:client                (Orval, react-query mode)
     ▼
packages/api-client/src/generated      (typed TanStack Query hooks + models)
     ▼
apps/web                               (consumes generated types only)
```

**Rules:**

- Never edit `apps/api/openapi.json` or `packages/api-client/src/generated/` by
  hand — they are generated and committed (so the repo works post-clone and
  contract changes show up as reviewable diffs).
- After any controller/DTO change, run `pnpm gen` and commit the artifacts. CI
  regenerates both and **fails on any drift**, so the contract-first claim is
  enforced, not aspirational.

**Auth:** the generated client attaches the bearer access token automatically
and, on a `401`, silently refreshes once via the rotating refresh-token flow
(`POST /v1/auth/refresh`) before replaying the request. Tokens live in
`localStorage` — the standard SPA demo trade-off; rotation + reuse-detection
limit the blast radius of a stolen refresh token.

## Scripts

Run from the repo root:

| Script              | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `pnpm dev`          | Run API (`:3000`) and web (`:5173`) together                  |
| `pnpm build`        | Build the API and the web app                                 |
| `pnpm test`         | Run all unit tests across the workspace                       |
| `pnpm lint:check`   | Lint the API and web app (no warnings allowed)                |
| `pnpm format:check` | Verify Prettier formatting                                    |
| `pnpm gen:openapi`  | Emit `apps/api/openapi.json` from the NestJS controllers/DTOs |
| `pnpm gen:client`   | Run Orval to regenerate the typed client, then type-check it  |
| `pnpm gen`          | `gen:openapi` then `gen:client` (the full contract pipeline)  |
| `pnpm db:migrate`   | Apply Prisma migrations (dev)                                 |
| `pnpm db:seed`      | Seed demo accounts and sample data                            |
| `pnpm db:studio`    | Open Prisma Studio                                            |

See `docs/` for the full design and roadmap. For frontend UI work, also read
`design_handoff_command_center/README.md`.
