# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 0 — Planning & docs. Design spec, context files, tooling decisions,
  and implementation plan are being written. No application code yet.

## Current Goal

- Finalize project documentation (six context files + design spec + tooling
  decisions + phased implementation plan), then scaffold the monorepo
  (Phase 1).

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

## In Progress

- None (planning complete; awaiting go-ahead to start Phase 1 scaffolding).

## Next Up

- Phase 1: scaffold the monorepo — initialize NestJS app in `backend/` and
  Vite React + TS app in `frontend/`, wire npm workspaces, base tooling
  (eslint/prettier), and a health endpoint.

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
- Known environment note: during initial setup the shell blocked write
  commands (git init returned no exit status) and the workspace-control MCP
  hung; docs were authored via direct file writes. Git init + agent move to
  root still pending when the shell cooperates.
