# logidash

[![CI](https://github.com/FreddieTheObserver/logidash/actions/workflows/ci.yml/badge.svg)](https://github.com/FreddieTheObserver/logidash/actions/workflows/ci.yml)

A backend-first **Logistics Dispatch API Platform** built with NestJS (backend) and React + TypeScript (frontend).

This repository is a pnpm-workspace monorepo (`apps/*`, `packages/*`):

- `apps/api/` — NestJS API (PostgreSQL + Prisma, contract-first OpenAPI, role-based auth, scoring-based driver recommendation engine, OpenRouteService integration)
- `apps/web/` — React + TypeScript dispatcher command-center UI (consumes the Orval-generated client from the API contract)
- `packages/api-client/` — shared API contract types + Orval-generated client consumed by `apps/web` (reserved; populated when the OpenAPI/Orval workflow is wired up)
- `docs/` — project context, design spec, and implementation plan
- `design_handoff_command_center/` — command center UI handoff (`README.md` + interactive `prototype/` reference)

See `docs/` for the full design and roadmap. For frontend UI work, also read
`design_handoff_command_center/README.md`.
