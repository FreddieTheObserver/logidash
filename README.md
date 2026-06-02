# logidash

A backend-first **Logistics Dispatch API Platform** built with NestJS (backend) and React + TypeScript (frontend).

This repository is a monorepo:

- `backend/` — NestJS API (PostgreSQL + Prisma, contract-first OpenAPI, role-based auth, scoring-based driver recommendation engine, OpenRouteService integration)
- `frontend/` — React + TypeScript dispatcher command-center UI (consumes Orval-generated client from the API contract)
- `docs/` — project context, design spec, and implementation plan

See `docs/` for the full design and roadmap.
