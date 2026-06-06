# API URL Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every business route under a `/v1` URL segment while keeping `/health` and `/docs` version-neutral, and document the governance policy that controls when the version bumps.

**Architecture:** Enable NestJS native URI versioning with a global `defaultVersion: '1'`, so all controllers are versioned automatically; the health controller explicitly opts out with `VERSION_NEUTRAL`. The same versioning config is applied both at bootstrap (`main.ts`) and in the e2e test app (which builds its own Nest instance from `AppModule` and therefore needs the config applied independently).

**Tech Stack:** NestJS 11 (`@nestjs/common` versioning), Jest + Supertest e2e, Prisma 7 (Postgres on host port 5433 via Docker).

---

## Important context for the implementer

- **The e2e tests do NOT run `main.ts`.** Each suite builds its own app via `Test.createTestingModule(...).createNestApplication()` + `app.init()`. `auth.e2e-spec.ts` already re-applies the global `ValidationPipe` in its `beforeAll` for exactly this reason. Versioning must be applied the same way — adding `enableVersioning` to `main.ts` alone will NOT version the test app.
- **`app.e2e-spec.ts` needs no change.** It only hits `/health`, which stays version-neutral, and it never enables versioning — `VERSION_NEUTRAL` metadata is simply ignored when versioning is off, so `/health` resolves normally either way.
- **Single atomic commit.** Per the approved spec, code + tests + docs ship as one logical commit (this is one contract change). The plan therefore commits once, at the end, instead of per-task. This is a deliberate, spec-mandated deviation from the usual per-task commit cadence.
- **Gotcha — keep the `login` helper non-async.** The `login` helper in `auth.e2e-spec.ts` returns the Supertest chain directly (not `async`). An `async` helper returns a Promise and breaks the `.expect()` chaining and trips `no-unsafe-*` lint. Only change the URL string inside it.
- **e2e precondition:** Docker Postgres must be up on host port 5433 (`docker compose up -d`) before running any e2e suite.

## File Structure

- **Modify** `apps/api/src/main.ts` — enable URI versioning at bootstrap (runtime + Swagger path generation).
- **Modify** `apps/api/src/health/health.controller.ts` — mark the controller `VERSION_NEUTRAL`.
- **Modify** `apps/api/test/auth.e2e-spec.ts` — apply versioning in the test app's setup and move all `/auth/*` and `/users` request paths to `/v1`.
- **Unchanged** `apps/api/test/app.e2e-spec.ts` — `/health` stays bare (documented above; no edit).
- **Modify** `docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md` — add a Versioning bullet to §9.
- **Modify** `docs/context/architecture.md` — note URI versioning + the version-neutral ops surface.
- **Modify** `docs/context/progress-tracker.md` — record the contract decision.

---

### Task 1: Move the e2e auth contract to `/v1` (RED)

**Files:**

- Modify: `apps/api/test/auth.e2e-spec.ts`

This task only rewrites the request paths to the target `/v1` contract — without yet enabling versioning — so the suite goes red for the right reason (the routes don't exist at `/v1` yet).

- [ ] **Step 1: Rewrite the `/auth/*` and `/users` request paths to `/v1`**

In `apps/api/test/auth.e2e-spec.ts`, change each path string below. **Leave `/health` (line 87) unchanged**, and **leave the `login` helper non-async** — only its URL changes.

`login` helper (was line 84):

```ts
const login = (email: string, password = PASSWORD) =>
  request(app.getHttpServer()).post('/v1/auth/login').send({ email, password });
```

`GET /auth/me without a token is 401` (was line 91):

```ts
await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
```

`login succeeds and /auth/me returns the role` (was line 102):

```ts
const me = await request(app.getHttpServer())
  .get('/v1/auth/me')
  .set('Authorization', `Bearer ${accessToken}`)
  .expect(200);
```

`admin can list users; other roles get 403` (was lines 115 and 120):

```ts
await request(app.getHttpServer())
  .get('/v1/users')
  .set('Authorization', `Bearer ${tokens.admin}`)
  .expect(200);
for (const role of ['dispatcher', 'driver', 'viewer']) {
  await request(app.getHttpServer())
    .get('/v1/users')
    .set('Authorization', `Bearer ${tokens[role]}`)
    .expect(403);
}
```

`refresh rotates tokens ...` (was lines 131 and 140):

```ts
const rotated = await request(app.getHttpServer())
  .post('/v1/auth/refresh')
  .send({ refreshToken })
  .expect(200);
```

```ts
await request(app.getHttpServer())
  .post('/v1/auth/refresh')
  .send({ refreshToken })
  .expect(401);
```

`logout revokes the refresh token` (was lines 149 and 153):

```ts
await request(app.getHttpServer())
  .post('/v1/auth/logout')
  .send({ refreshToken })
  .expect(204);
await request(app.getHttpServer())
  .post('/v1/auth/refresh')
  .send({ refreshToken })
  .expect(401);
```

- [ ] **Step 2: Run the auth e2e suite to verify it fails**

Ensure Docker Postgres is up first: `docker compose up -d`

Run (from `apps/api`):

```bash
npm run test:e2e -- auth.e2e-spec
```

Expected: FAIL. The `/v1/...` requests return `404` (routes are still mounted at bare paths), so the `login` calls that `.expect(200)` fail. The `GET /health` test still passes.

---

### Task 2: Enable URI versioning + version-neutral health (GREEN)

**Files:**

- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts` (setup only)

- [ ] **Step 1: Enable URI versioning at bootstrap in `main.ts`**

Add `VersioningType` to the `@nestjs/common` import and call `enableVersioning` right after the `ConfigService` is resolved.

Change the import line:

```ts
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
```

Insert immediately after `const config = app.get<ConfigService<Env, true>>(ConfigService);`:

```ts
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

- [ ] **Step 2: Make the health controller version-neutral**

Replace the contents of `apps/api/src/health/health.controller.ts` with:

```ts
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 3: Apply the same versioning config in the e2e test app**

In `apps/api/test/auth.e2e-spec.ts`, add `VersioningType` to the `@nestjs/common` import:

```ts
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
```

Then, in `beforeAll`, insert the `enableVersioning` call after the `app.useGlobalPipes(...)` block and before `await app.init();`:

```ts
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

- [ ] **Step 4: Run the auth e2e suite to verify it passes**

Run (from `apps/api`):

```bash
npm run test:e2e -- auth.e2e-spec
```

Expected: PASS (all 8 tests). The `/v1/...` routes now resolve, and `GET /health` still returns 200 because the controller is `VERSION_NEUTRAL` even though versioning is enabled on this app.

- [ ] **Step 5: Run the health e2e suite to confirm no regression**

Run (from `apps/api`):

```bash
npm run test:e2e -- app.e2e-spec
```

Expected: PASS. `/health` still resolves at the bare path (this app does not enable versioning; the neutral metadata is inert).

---

### Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run (from `apps/api`):

```bash
npm run build
```

Expected: compiles clean (Prisma generate + `nest build`, no TypeScript errors).

- [ ] **Step 2: Lint**

Run (from `apps/api`):

```bash
npm run lint
```

Expected: no errors. (The `--fix` flag auto-formats; confirm no unfixable violations remain.)

- [ ] **Step 3: Full unit + e2e suites**

Ensure Docker Postgres is up (`docker compose up -d`), then run (from `apps/api`):

```bash
npm run test
npm run test:e2e
```

Expected: all unit suites pass (health controller's unit test calls the method directly, so the decorator change does not affect it); all e2e suites pass (auth: 8, health: 1).

---

### Task 4: Documentation sync

**Files:**

- Modify: `docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`
- Modify: `docs/context/architecture.md`
- Modify: `docs/context/progress-tracker.md`

- [ ] **Step 1: Add a Versioning bullet to design spec §9**

In `docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`, under `## 9. API & Contract Conventions`, add as the final bullet:

```markdown
- Versioning: URL-based (`/v1/...`, no `/api` prefix) via NestJS URI
  versioning with a global `defaultVersion: '1'`. `health` and `docs` are
  version-neutral (stable ops surface). The URL carries a major integer
  only; a new version (v2) is introduced solely for breaking contract
  changes (removing/renaming a field or route, changing a field's
  type/semantics, making an optional input required, or changing the
  response/error envelope), served in parallel with v1 behind a deprecation
  window. The OpenAPI `info.version` tracks the release/spec version and is
  independent of the URL major. Full rationale:
  `docs/superpowers/specs/2026-06-06-api-url-versioning-design.md`.
```

- [ ] **Step 2: Note versioning in `architecture.md`**

In `docs/context/architecture.md`, near the API-contract description (the `health/` + OpenAPI bootstrap line under the cross-cutting section), add a sentence:

```markdown
- API routes are URL-versioned under `/v1` (NestJS URI versioning, global
  `defaultVersion: '1'`); `health` and the Swagger `docs` mount are
  version-neutral. See the versioning design spec for the bump policy.
```

- [ ] **Step 3: Record the decision in `progress-tracker.md`**

In `docs/context/progress-tracker.md`, add under `## Architecture Decisions`:

```markdown
- API URL versioning (decided 2026-06-06): all business routes under `/v1`
  via NestJS URI versioning (global `defaultVersion: '1'`); `health`/`docs`
  version-neutral; major-only URL, v2 only on breaking contract changes.
  Spec: `docs/superpowers/specs/2026-06-06-api-url-versioning-design.md`.
```

And add a line under `## Completed` (or a short `### Versioning` note) summarizing that the change landed once implementation is done.

---

### Task 5: Commit (single atomic commit)

**Files:** all of the above.

- [ ] **Step 1: Stage and commit code + tests + docs together**

Run (from repo root):

```bash
git add apps/api/src/main.ts \
  apps/api/src/health/health.controller.ts \
  apps/api/test/auth.e2e-spec.ts \
  docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md \
  docs/context/architecture.md \
  docs/context/progress-tracker.md
git commit -m "feat(api): add URL versioning (/v1) with version-neutral health/docs

Enable NestJS URI versioning (global defaultVersion '1'); all business
routes move under /v1. Health controller marked VERSION_NEUTRAL so probes
keep a stable path; Swagger docs mount unaffected. e2e app applies the same
versioning config (it builds its own Nest instance). Docs updated with the
major-only bump policy.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: pre-commit hook (lint-staged + prettier) passes; one commit created.

---

## Notes

- The branch `api-url-versioning` already exists (the design spec was committed there). Execute this plan on that branch.
- No `/api` prefix, no per-version Swagger docs, and no actual v2 routes are in scope (see design spec §8).
