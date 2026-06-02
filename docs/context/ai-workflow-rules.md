# AI Workflow Rules

## Approach

Build logidash incrementally using a spec-driven workflow. The context files
in `docs/context/` plus the design spec in
`docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md` and the
plan in `docs/implementation-plan.md` define what to build, how to build it,
and the current state of progress. Always implement against these specs — do
not infer or invent product behavior from scratch. The backend OpenAPI
contract is the source of truth for the API; the frontend consumes only the
Orval-generated client derived from it.

## Scoping Rules

- Work on one feature unit at a time (one domain module, one phase task).
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step
  (e.g. do not change the scoring engine and the React dashboard together).
- Backend before frontend for any feature that needs a contract: define DTOs
  + Swagger annotations, regenerate the OpenAPI spec, regenerate the Orval
  client, then build the UI against generated types.

## When to Split Work

Split an implementation step if it combines:

- Backend domain logic changes and frontend UI changes.
- Multiple unrelated API resources/modules.
- Schema/migration changes and feature logic that depends on them.
- Behavior not clearly defined in the context files or design spec.

If a change cannot be verified end to end quickly (test, build, or a single
API call), the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files or spec.
- If a requirement is ambiguous, resolve it in the relevant context file (or
  the design spec) before implementing.
- If a requirement is missing, add it under "Open Questions" in
  `progress-tracker.md` before continuing.

## Protected Files

Do not modify the following unless explicitly instructed:

- `frontend/src/api/generated/*` — Orval-generated client/types. Regenerate
  via the codegen command instead of editing by hand.
- Prisma migration files under `backend/prisma/migrations/*` once committed —
  create a new migration rather than editing an applied one.
- Any third-party library internals / lockfile-managed dependencies.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or module boundaries → `architecture.md`.
- Storage/schema model decisions → `architecture.md` (+ note in tracker).
- Code conventions or standards → `code-standards.md`.
- UI tokens/layout conventions → `ui-context.md`.
- Feature scope → `project-overview.md`.
- Always update `progress-tracker.md` after meaningful work.

When the API contract changes, regenerate the OpenAPI spec and the Orval
client in the same unit of work so backend and frontend never drift.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. Relevant tests pass (unit and/or e2e for the touched area).
4. The OpenAPI spec + Orval client are regenerated if the contract changed.
5. `progress-tracker.md` reflects the completed work.
6. The relevant build passes (`backend`: build + lint; `frontend`: build).
