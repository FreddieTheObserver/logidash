# Code Standards

## General

- Keep modules small and single-purpose; one domain concern per NestJS
  module, one responsibility per service.
- Fix root causes, not symptoms — no swallowing errors or layering
  workarounds over a broken contract.
- Do not mix unrelated concerns in one controller, service, or component.
- Business rules live in services, never in controllers or React components.
- Prefer pure, deterministic functions for scoring/eligibility so they are
  trivially unit-testable.

## TypeScript

- `strict` mode is required in both `backend` and `frontend` tsconfigs.
- No `any`. Use explicit interfaces/types; use `unknown` + narrowing for
  genuinely dynamic external input.
- Validate and parse all unknown external input at system boundaries
  (controllers, route loaders) before trusting it.
- Share no runtime code across backend/frontend except via the generated
  OpenAPI client; never hand-duplicate API types on the frontend.

## NestJS (backend)

- One module per domain aggregate (`deliveries`, `drivers`, etc.); modules
  expose providers through their own module, not via global singletons.
- Controllers are thin: validate input (DTO + `ValidationPipe`), delegate to
  a service, shape the response. No business logic in controllers.
- Use DTO classes with `class-validator` / `class-transformer` decorators
  for every request body, query, and param object.
- Annotate every endpoint with `@nestjs/swagger` decorators (operation,
  response types, status codes, auth) — the OpenAPI contract is a
  first-class deliverable, not an afterthought.
- Authorization via guards (`@Roles(...)` + a roles guard); never inline
  role checks ad hoc in handlers.
- All DB access goes through Prisma in the service layer; never query the DB
  from a controller.
- Wrap multi-write operations (assignment + audit, status change + audit) in
  a Prisma transaction so audit entries can never desync from the change.
- Access OpenRouteService only through the `maps` adapter interface.

## Error Handling & API Responses

- Use a global exception filter to produce consistent error bodies:
  `{ statusCode, error, message, details? }`.
- Standardized status code semantics:
  - `400` — DTO/validation failure (field-level `details`).
  - `401` — unauthenticated.
  - `403` — authenticated but not permitted by role/ownership.
  - `404` — resource not found.
  - `409` — business-rule conflict (e.g. ineligible assignment, illegal
    status transition).
- Success responses use consistent shapes; list endpoints return a
  predictable paginated envelope.
- Never leak internal/Prisma errors or stack traces to clients.

## Data and Storage

- Relational/business data and ownership belong in Postgres via Prisma.
- Flexible structured payloads (score explanations, input snapshots, audit
  diffs) use `jsonb` columns; never use JSON as a primary query key.
- Use enums (Prisma + Postgres) for closed sets: roles, delivery status,
  assignment status, vehicle type, package size.
- Add indexes for hot query paths (delivery status/zone/deadline, driver
  availability, route-estimate origin/destination keys).
- The audit log is append-only — no updates or deletes.

## React + Frontend

- Server state is owned by TanStack Query via Orval-generated hooks; do not
  copy server data into ad-hoc local state.
- Local state (`useState`/Zustand) is for UI-only concerns (modals, form
  drafts, filters) — keep Zustand usage minimal and justified.
- Every async surface handles loading, error, and empty states explicitly.
- Components are typed with generated API types; no hand-written DTO mirrors.
- Co-locate feature code under `features/<feature>/`; shared UI in
  `components/`, cross-cutting setup in `lib/`.
- Route guards enforce role-aware navigation for UX; treat them as
  convenience, not security.

## Styling

- Use design tokens (CSS custom properties) defined in `ui-context.md`; no
  hardcoded hex values or magic spacing in components.
- Follow the spacing, radius, and color scales defined in `ui-context.md`.

## Testing

- Unit-test all scoring factors, eligibility rules, and status-transition
  logic (pure functions / services with mocked Prisma).
- e2e-test key API flows: auth, role enforcement, delivery lifecycle,
  assignment validation, recommendation endpoints.
- The `maps` adapter is tested via a mock provider covering success,
  failure/timeout, and cache-hit behavior.
- Tests must not call the real OpenRouteService or a real network.

## File Organization

- `backend/src/<domain>/` — controller, service, DTOs, module, and tests for
  one domain aggregate.
- `backend/src/common/` — filters, interceptors, pipes, guards, shared types.
- `backend/src/prisma/` — schema, client module, migrations, seed.
- `frontend/src/features/<feature>/` — pages, components, hooks for a feature.
- `frontend/src/api/generated/` — Orval output (do not hand-edit).
- `frontend/src/components/`, `frontend/src/lib/`, `frontend/src/routes/` —
  shared UI, setup/clients, and routing.
