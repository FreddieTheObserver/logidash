# Phase 7 — Contract Emit & Frontend Client Generation — Implementation Plan

> **For agentic workers:** Execute task-by-task. This project has run plans
> **teach-and-build** (user types the code with guidance — see the
> `teach-and-build` skill) and **auto** (the agent writes files directly). Either
> works; pick at kickoff. Steps use checkbox (`- [ ]`) syntax for tracking. The
> design spec (`docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`)
> and code standards (`docs/context/code-standards.md`) are **locked**.

**Goal:** Lock the contract-first pipeline — `pnpm gen:openapi` emits a complete,
committed `apps/api/openapi.json` (typed responses, auth scheme, error shapes,
examples); `pnpm gen:client` runs Orval (react-query mode) to generate typed
TanStack Query hooks into `packages/api-client`, wired through an axios mutator
with silent token refresh on 401; CI proves the committed contract never drifts
from the code.

**Architecture:** The API gains a shared OpenAPI document builder
(`src/openapi/`) used by both `main.ts` (live `/docs`) and a standalone
`gen:openapi` script (boots `AppModule` via `NestFactory.create` with placeholder
env, never calls `app.init()`/`listen()` so Prisma never connects). Every
endpoint gets explicit `@ApiOkResponse`/`@ApiCreatedResponse`/etc. decorators
(matching the existing explicit style — no Swagger CLI plugin) plus a shared
`ErrorResponseDto` + `ApiErrorResponses()` helper mirroring the global exception
filter's body. `packages/api-client` owns the axios instance
(`src/http/custom-instance.ts`): request interceptor attaches the bearer token
from localStorage; response interceptor does single-flight rotate-and-retry on
401 via `POST /v1/auth/refresh` (Phase 3's rotation flow). Orval emits
tags-split hooks/models into `src/generated/`; `apps/web` configures the client
at startup and type-checks against generated types only.

**Tech Stack:** NestJS 11 + `@nestjs/swagger` (existing), `tsx` (existing) for
the emit script; **new deps:** `orval` (devDep, api-client), `axios` +
`@tanstack/react-query` (api-client peer + web deps), `vitest` (devDep,
api-client). No schema migration; no API behavior changes.

---

## Context

Phases 1–6 finished the entire backend surface (auth, domain CRUD, maps,
recommendations, assignments — 151 unit / 43 e2e green, merged to `main`). The
implementation plan's Phase 7 closes the contract-first loop promised in the
design spec ("NestJS → OpenAPI → Orval client + TanStack Query hooks") so Phase
8 (frontend command center) can consume generated hooks exclusively.

**Key finding from codebase review:** only `RecommendationsController` declares
a response schema (`@ApiOkResponse`); list endpoints have `@ApiPaginatedResponse`,
but every other endpoint emits **schema-less responses** — Orval would generate
`unknown`-typed hooks, defeating the phase. The Swagger CLI plugin is _not_
enabled and the codebase convention is explicit annotation (DTOs hand-decorated
with `@ApiProperty`), so this plan stays explicit and adds the missing response
decorators. The error model exists only as a private interface inside
`all-exceptions.filter.ts` and must become a documented DTO.

**Decisions locked with the user (2026-06-11):**

1. **Generated artifacts are committed**: `apps/api/openapi.json` and
   `packages/api-client/src/generated/` live in git (reviewable contract diffs,
   repo works post-clone without generators).
2. **CI drift check**: the quality job regenerates both and fails on
   `git diff --exit-code` — the contract-first claim is enforced, not aspirational.
3. **Token storage: localStorage** (key `logidash.auth.tokens`), with an
   internal in-memory fallback only where `localStorage` doesn't exist (unit
   tests / non-browser tooling). XSS trade-off documented in README; rotating
   refresh tokens (Phase 3) limit blast radius.
4. Both artifacts are added to `.prettierignore` (generated output; keeps the
   CI drift check byte-deterministic). They must **not** be gitignored.
5. Hook naming via `operationIdFactory`: `ZonesController.list` → `zonesList` →
   `useZonesList` (default Nest ids produce `useZonesControllerList`).

**Out of scope (Phase 8):** QueryClientProvider, login page, any real UI usage
of the hooks. Phase 7 ends at "web type-checks against generated types."

---

## File Structure

```
apps/api/
  src/openapi/swagger.config.ts          # NEW — DocumentBuilder + operationIdFactory + createOpenApiDocument(app)
  src/openapi/generate-openapi.ts        # NEW — standalone emit script (tsx)
  src/common/dto/error-response.dto.ts   # NEW — ErrorResponseDto (mirrors filter's ErrorBody)
  src/common/decorators/api-error-responses.decorator.ts  # NEW
  src/modules/auth/dto/auth-user.dto.ts  # NEW — typed response for GET /v1/auth/me
  src/health/health.controller.ts        # MODIFY — HealthStatusDto + @ApiTags/@ApiOkResponse
  src/main.ts                            # MODIFY — use createOpenApiDocument
  src/modules/*/(*.controller.ts)        # MODIFY — response + error decorators (sweep)
  openapi.json                           # NEW, generated + committed
  package.json                           # MODIFY — gen:openapi script

packages/api-client/
  orval.config.ts                        # NEW
  src/http/token-storage.ts              # NEW (+ token-storage.spec.ts)
  src/http/custom-instance.ts            # NEW (+ custom-instance.spec.ts)
  src/generated/**                       # NEW, generated + committed
  src/index.ts                           # MODIFY — real exports replace placeholder
  package.json                           # MODIFY — deps + generate/typecheck/test scripts

apps/web/
  src/lib/api.ts                         # NEW — configureHttpClient at startup
  src/main.tsx                           # MODIFY — import './lib/api'
  src/vite-env.d.ts                      # MODIFY — type VITE_API_URL
  .env.example                           # NEW
  package.json                           # MODIFY — api-client/axios/react-query deps

root: package.json (gen scripts), .prettierignore, .github/workflows/ci.yml, README.md (NEW)
```

---

### Task 1: Branch + save plan

- [ ] **Step 1:** From `main` (Phase 6 already merged — verify `git log --oneline -1` shows `43e446c docs: sync tracker...`), create the branch:

```bash
git checkout -b phase-7-contract-and-client-generation
```

- [ ] **Step 2:** Save this document as
      `docs/superpowers/plans/2026-06-11-phase-7-contract-and-client-generation.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-06-11-phase-7-contract-and-client-generation.md
git commit -m "docs: save phase 7 plan (contract emit + client generation)"
```

---

### Task 2: Shared OpenAPI document builder

**Files:**

- Create: `apps/api/src/openapi/swagger.config.ts`
- Modify: `apps/api/src/main.ts:36-45`

- [ ] **Step 1:** Create `apps/api/src/openapi/swagger.config.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Stable operationIds drive the generated client's hook names:
 * ZonesController.list -> "zonesList" -> useZonesList(). Nest's default id
 * (ZonesController_list) works but produces useZonesControllerList.
 */
function operationIdFactory(controllerKey: string, methodKey: string): string {
  const resource = controllerKey.replace(/Controller$/, '');
  return (
    resource.charAt(0).toLowerCase() +
    resource.slice(1) +
    methodKey.charAt(0).toUpperCase() +
    methodKey.slice(1)
  );
}

/**
 * Single source of truth for the OpenAPI document — used by main.ts (/docs)
 * and the gen:openapi script, so the served and emitted contracts can't drift.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('logidash API')
    .setDescription(
      'Logistics dispatch API — contract-first OpenAPI surface. ' +
        'All business routes are versioned under /v1.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, { operationIdFactory });
}
```

- [ ] **Step 2:** In `main.ts`, replace the inline `DocumentBuilder` block (lines 36–45) with:

```ts
if (config.get('NODE_ENV', { infer: true }) !== 'production') {
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
}
```

Add `import { createOpenApiDocument } from './openapi/swagger.config';` and drop
the now-unused `DocumentBuilder` import (keep `SwaggerModule`).

- [ ] **Step 3:** Verify:

```bash
pnpm --filter @logidash/api build && pnpm --filter @logidash/api lint:check && pnpm --filter @logidash/api test
```

Expected: build OK, lint clean, 151 unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/openapi/swagger.config.ts apps/api/src/main.ts
git commit -m "refactor(api): extract shared OpenAPI document builder with stable operationIds"
```

---

### Task 3: Documented error contract

**Files:**

- Create: `apps/api/src/common/dto/error-response.dto.ts`
- Create: `apps/api/src/common/decorators/api-error-responses.decorator.ts`

- [ ] **Step 1:** Create `error-response.dto.ts` — must mirror `ErrorBody` in
      `all-exceptions.filter.ts:11-16` exactly:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The body shape produced by AllExceptionsFilter for every non-2xx response.
 * Documented here so the generated client gets a typed error model.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'Conflict' }) error!: string;
  @ApiProperty({ example: 'Delivery is not in ready status' }) message!: string;
  @ApiPropertyOptional({
    type: [String],
    description: 'Per-field validation messages (400 responses only)',
    example: ['name should not be empty'],
  })
  details?: string[];
}
```

- [ ] **Step 2:** Create `api-error-responses.decorator.ts`:

```ts
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

type ErrorStatus = 400 | 401 | 403 | 404 | 409;

const DESCRIPTIONS: Record<ErrorStatus, string> = {
  400: 'Validation failed — details lists per-field messages',
  401: 'Missing, expired, or invalid credentials/token',
  403: 'Authenticated but not allowed to perform this action',
  404: 'Resource not found',
  409: 'Business-rule conflict (illegal transition, referenced resource, duplicate, lost race)',
};

/** Documents standard error responses (all share the ErrorResponseDto shape). */
export function ApiErrorResponses(
  ...statuses: ErrorStatus[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        type: ErrorResponseDto,
        description: DESCRIPTIONS[status],
      }),
    ),
  );
}
```

- [ ] **Step 3:** Verify `pnpm --filter @logidash/api build` passes, then commit:

```bash
git add apps/api/src/common
git commit -m "feat(api): document the error response contract (ErrorResponseDto + ApiErrorResponses)"
```

---

### Task 4: Response-schema sweep across all controllers

**Files:**

- Create: `apps/api/src/modules/auth/dto/auth-user.dto.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `auth`, `users`, `zones`, `vehicles`, `drivers`, `deliveries`,
  `assignments`, `recommendations` controllers
- Modify: `apps/api/src/modules/auth/dto/login.dto.ts` (examples)

- [ ] **Step 1:** Create `AuthUserDto`. First open
      `apps/api/src/common/types/auth-user.ts` and mirror its fields **exactly**
      (expected: `id`, `email`, `role`):

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums';

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'dispatcher@logidash.dev' }) email!: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role!: Role;
}
```

(If `auth-user.ts` has more/different fields, match them — the e2e for
`/auth/me` defines the truth.)

- [ ] **Step 2:** Health: convert the `HealthStatus` interface into a DTO class
      in `health.controller.ts` (grep `HealthStatus` first — update any e2e import):

```ts
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusDto {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: '2026-06-11T12:00:00.000Z' }) timestamp!: string;
}

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthStatusDto })
  check(): HealthStatusDto {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 3:** Add example demo credentials to `LoginDto` — read
      `apps/api/prisma/seed.ts` for the real seeded emails (password `Demo123!`) and
      use them as `@ApiProperty({ example: ... })` values so the Swagger "Try it out"
      works against a seeded DB.

- [ ] **Step 4:** Apply the decorator sweep. Class-level on every
      bearer-guarded controller: `@ApiErrorResponses(401)` (users controller:
      `@ApiErrorResponses(401, 403)` since the whole class is admin-only). Then
      per-endpoint, exactly:

| Controller.method                         | Add                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Auth.login                                | `@ApiOkResponse({ type: AuthTokensDto })`, `@ApiErrorResponses(400, 401, 403)`           |
| Auth.refresh                              | `@ApiOkResponse({ type: AuthTokensDto })`, `@ApiErrorResponses(400, 401)`                |
| Auth.logout                               | `@ApiNoContentResponse()`, `@ApiErrorResponses(400)`                                     |
| Auth.me                                   | `@ApiOkResponse({ type: AuthUserDto })` (class-level 401 covers the rest)                |
| Users.create                              | `@ApiCreatedResponse({ type: UserDto })`, `@ApiErrorResponses(400, 409)`                 |
| Users.list                                | `@ApiOkResponse({ type: UserDto, isArray: true })`                                       |
| Users.getById                             | `@ApiOkResponse({ type: UserDto })`, `@ApiErrorResponses(404)`                           |
| Users.update                              | `@ApiOkResponse({ type: UserDto })`, `@ApiErrorResponses(400, 404, 409)`                 |
| Zones.create                              | `@ApiCreatedResponse({ type: ZoneDto })`, `@ApiErrorResponses(400, 403)`                 |
| Zones.list                                | `@ApiErrorResponses(400)` (keeps existing `@ApiPaginatedResponse`)                       |
| Zones.getById                             | `@ApiOkResponse({ type: ZoneDto })`, `@ApiErrorResponses(404)`                           |
| Zones.update                              | `@ApiOkResponse({ type: ZoneDto })`, `@ApiErrorResponses(400, 403, 404)`                 |
| Zones.remove                              | `@ApiNoContentResponse()`, `@ApiErrorResponses(403, 404, 409)`                           |
| Vehicles.\*                               | same pattern as Zones with `VehicleDto`                                                  |
| Drivers.create                            | `@ApiCreatedResponse({ type: DriverDto })`, `@ApiErrorResponses(400, 403, 404, 409)`     |
| Drivers.list                              | `@ApiErrorResponses(400)`                                                                |
| Drivers.getById                           | `@ApiOkResponse({ type: DriverDto })`, `@ApiErrorResponses(404)`                         |
| Drivers.update                            | `@ApiOkResponse({ type: DriverDto })`, `@ApiErrorResponses(400, 403, 404)`               |
| Drivers.setVehicle                        | `@ApiOkResponse({ type: DriverDto })`, `@ApiErrorResponses(400, 403, 404, 409)`          |
| Drivers.remove                            | `@ApiNoContentResponse()`, `@ApiErrorResponses(403, 404, 409)`                           |
| Deliveries.create                         | `@ApiCreatedResponse({ type: DeliveryDto })`, `@ApiErrorResponses(400, 403, 404)`        |
| Deliveries.list                           | `@ApiErrorResponses(400)`                                                                |
| Deliveries.getById                        | `@ApiOkResponse({ type: DeliveryDto })`, `@ApiErrorResponses(404)`                       |
| Deliveries.update                         | `@ApiOkResponse({ type: DeliveryDto })`, `@ApiErrorResponses(400, 403, 404)`             |
| Deliveries.changeStatus                   | `@ApiOkResponse({ type: DeliveryDto })`, `@ApiErrorResponses(400, 403, 404, 409)`        |
| Recommendations.getForDelivery            | keep `@ApiOkResponse`; add `@ApiErrorResponses(403, 404, 409)`                           |
| Assignments.create                        | `@ApiCreatedResponse({ type: AssignmentDto })`, `@ApiErrorResponses(400, 403, 404, 409)` |
| Assignments.listByDelivery / listByDriver | `@ApiErrorResponses(400, 404)`                                                           |

- [ ] **Step 5:** Verify the full backend:

```bash
pnpm --filter @logidash/api build && pnpm --filter @logidash/api lint:check && pnpm --filter @logidash/api test
```

Expected: all green (decorators are metadata-only; no behavior change).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): declare response schemas and error shapes on every endpoint"
```

---

### Task 5: `gen:openapi` script + committed `openapi.json`

**Files:**

- Create: `apps/api/src/openapi/generate-openapi.ts`
- Modify: `apps/api/package.json`, root `package.json`, `.prettierignore`

- [ ] **Step 1:** Create `generate-openapi.ts`. Env placeholders are assigned
      **before** `AppModule` is loaded, so use dynamic import (static imports hoist):

```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Emits openapi.json without starting the HTTP server or touching the
 * database: lifecycle hooks (and Prisma's $connect) only run on app.init(),
 * which is never called. Boot-time env validation still runs, so anything
 * required-but-irrelevant gets a placeholder. AppModule is imported
 * dynamically AFTER the placeholders are set.
 */
process.env.DATABASE_URL ??=
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.JWT_SECRET ??= 'openapi-generation-placeholder-secret-0000';
process.env.MAPS_PROVIDER ??= 'mock';

async function generate(): Promise<void> {
  const { AppModule } = await import('../app.module');
  const { createOpenApiDocument } = await import('./swagger.config');

  const app = await NestFactory.create(AppModule, { logger: false });
  // Mirror main.ts so emitted paths carry the /v1 prefix.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const document = createOpenApiDocument(app);
  const outPath = join(process.cwd(), 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');
  await app.close();

  console.log(
    `openapi.json written: ${Object.keys(document.paths).length} paths`,
  );
}

void generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

(If the api ESLint config rejects `console`, add
`/* eslint-disable no-console */` at the top — it's a CLI script.)

- [ ] **Step 2:** Scripts. In `apps/api/package.json`:

```json
"gen:openapi": "tsx src/openapi/generate-openapi.ts",
```

In root `package.json`:

```json
"gen:openapi": "pnpm --filter @logidash/api gen:openapi",
```

- [ ] **Step 3:** Add to `.prettierignore` (generated artifacts; keeps the CI
      drift check byte-deterministic):

```
apps/api/openapi.json
packages/api-client/src/generated/
```

- [ ] **Step 4:** Run and spot-check:

```bash
pnpm gen:openapi
```

Expected: `openapi.json written: ~30 paths`. Then verify (PowerShell):

```powershell
$doc = Get-Content apps/api/openapi.json | ConvertFrom-Json
$doc.paths.PSObject.Properties.Name | Select-Object -First 5   # expect /v1/... + /health
$doc.components.schemas.PSObject.Properties.Name -contains 'ErrorResponseDto'  # True
$doc.paths.'/v1/zones'.get.operationId                          # zonesList
$doc.components.securitySchemes                                 # bearer
```

Also confirm `git check-ignore apps/api/openapi.json` matches **nothing**
(if a `.gitignore` pattern catches it, scope that pattern to Prisma's
`apps/api/src/generated/`).

- [ ] **Step 5:** Verify lint still clean (`pnpm --filter @logidash/api lint:check`), then commit:

```bash
git add apps/api/src/openapi/generate-openapi.ts apps/api/package.json package.json .prettierignore apps/api/openapi.json
git commit -m "feat(api): gen:openapi script + committed openapi.json contract artifact"
```

---

### Task 6: api-client toolchain setup

**Files:**

- Modify: `packages/api-client/package.json`
- Create: `packages/api-client/orval.config.ts`

- [ ] **Step 1:** Install deps (peer deps for runtime libs — the consumer
      provides them; devDeps so the package's own typecheck/tests resolve):

```bash
pnpm --filter @logidash/api-client add -D orval typescript vitest axios @tanstack/react-query
```

Then hand-edit `packages/api-client/package.json` to also declare:

```json
"peerDependencies": {
  "@tanstack/react-query": "^5.0.0",
  "axios": "^1.0.0"
},
"scripts": {
  "generate": "orval --config ./orval.config.ts",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

(Adjust peer ranges to the majors pnpm actually resolved.)

- [ ] **Step 2:** Create `orval.config.ts`:

```ts
import { defineConfig } from 'orval';

export default defineConfig({
  logidash: {
    input: {
      target: '../../apps/api/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/generated/endpoints',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      override: {
        mutator: {
          path: './src/http/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/package.json packages/api-client/orval.config.ts pnpm-lock.yaml
git commit -m "chore(api-client): orval + vitest toolchain and react-query/axios peer deps"
```

---

### Task 7: Token storage (TDD)

**Files:**

- Create: `packages/api-client/src/http/token-storage.spec.ts`
- Create: `packages/api-client/src/http/token-storage.ts`

- [ ] **Step 1: Write the failing test** (`token-storage.spec.ts`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokens, getTokens, setTokens } from './token-storage';

const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' };

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

describe('token storage (localStorage available)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeLocalStorage()));
  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it('round-trips tokens', () => {
    setTokens(TOKENS);
    expect(getTokens()).toEqual(TOKENS);
  });

  it('returns null when nothing stored', () => {
    expect(getTokens()).toBeNull();
  });

  it('clears tokens', () => {
    setTokens(TOKENS);
    clearTokens();
    expect(getTokens()).toBeNull();
  });

  it('treats corrupted JSON as logged out', () => {
    localStorage.setItem('logidash.auth.tokens', '{not json');
    expect(getTokens()).toBeNull();
  });
});

describe('token storage (no localStorage — memory fallback)', () => {
  afterEach(() => clearTokens());

  it('round-trips tokens in memory', () => {
    setTokens(TOKENS);
    expect(getTokens()).toEqual(TOKENS);
    clearTokens();
    expect(getTokens()).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @logidash/api-client test` — expected:
      FAIL (`token-storage` module not found).

- [ ] **Step 3: Implement** (`token-storage.ts`):

```ts
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = 'logidash.auth.tokens';

// Fallback so the module also works where localStorage doesn't exist
// (unit tests, non-browser tooling). Browsers always use localStorage.
let memoryTokens: AuthTokens | null = null;

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function getTokens(): AuthTokens | null {
  const store = storage();
  if (!store) return memoryTokens;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthTokens>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string'
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
      };
    }
  } catch {
    // fall through: corrupted payload is treated as logged out
  }
  store.removeItem(STORAGE_KEY);
  return null;
}

export function setTokens(tokens: AuthTokens): void {
  const store = storage();
  if (store) store.setItem(STORAGE_KEY, JSON.stringify(tokens));
  else memoryTokens = tokens;
}

export function clearTokens(): void {
  memoryTokens = null;
  storage()?.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4:** Run `pnpm --filter @logidash/api-client test` — expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/http
git commit -m "feat(api-client): localStorage token storage with memory fallback"
```

---

### Task 8: Axios mutator with silent refresh (TDD)

**Files:**

- Create: `packages/api-client/src/http/custom-instance.spec.ts`
- Create: `packages/api-client/src/http/custom-instance.ts`

Behavior contract: request interceptor attaches `Authorization: Bearer <access>`
from storage; on a 401 response (not from an `/auth/*` call, not already
retried) it runs a **single-flight** `POST /v1/auth/refresh { refreshToken }`
with bare axios (bypasses the instance, no recursion), stores the rotated pair,
and replays the original request once (the request interceptor re-attaches the
fresh token); a failed refresh clears tokens and fires `onSessionExpired`.

- [ ] **Step 1: Write the failing test** (`custom-instance.spec.ts`). The
      `adapter` option makes tests hermetic — no network, full request capture:

```ts
import type { AxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureHttpClient, customInstance } from './custom-instance';
import { clearTokens, getTokens, setTokens } from './token-storage';

const TOKENS = { accessToken: 'old-access', refreshToken: 'old-refresh' };
const ROTATED = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  tokenType: 'Bearer',
  expiresIn: '15m',
};

type Call = { url: string; auth: string | undefined; data: unknown };

/** Programmable axios adapter: maps url -> ordered list of responses. */
function makeAdapter(
  script: Record<string, Array<{ status: number; data?: unknown }>>,
) {
  const calls: Call[] = [];
  const adapter = vi.fn((config: AxiosRequestConfig) => {
    const url = config.url ?? '';
    calls.push({
      url,
      auth: (config.headers as Record<string, unknown>)?.Authorization as
        | string
        | undefined,
      data: config.data ? JSON.parse(config.data as string) : undefined,
    });
    const next = script[url]?.shift() ?? { status: 200, data: { ok: true } };
    const response = {
      status: next.status,
      statusText: '',
      data: next.data ?? {},
      headers: {},
      config,
    };
    return next.status < 400
      ? Promise.resolve(response)
      : Promise.reject(
          Object.assign(new Error(`HTTP ${next.status}`), {
            isAxiosError: true,
            response,
            config,
          }),
        );
  });
  return { adapter, calls };
}

afterEach(() => clearTokens());

describe('customInstance', () => {
  it('attaches the stored access token as a bearer header', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({});
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await customInstance({ url: '/v1/zones', method: 'GET' });
    expect(calls[0].auth).toBe('Bearer old-access');
  });

  it('sends no auth header when logged out', async () => {
    const { adapter, calls } = makeAdapter({});
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await customInstance({ url: '/v1/zones', method: 'GET' });
    expect(calls[0].auth).toBeUndefined();
  });

  it('on 401: refreshes, stores rotated tokens, retries with the new token', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({
      '/v1/zones': [{ status: 401 }, { status: 200, data: [{ id: 'z1' }] }],
      '/v1/auth/refresh': [{ status: 200, data: ROTATED }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    const data = await customInstance({ url: '/v1/zones', method: 'GET' });
    expect(data).toEqual([{ id: 'z1' }]);
    expect(getTokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const refresh = calls.find((c) => c.url === '/v1/auth/refresh');
    expect(refresh?.data).toEqual({ refreshToken: 'old-refresh' });
    expect(calls.at(-1)).toMatchObject({
      url: '/v1/zones',
      auth: 'Bearer new-access',
    });
  });

  it('two concurrent 401s trigger exactly one refresh (single-flight)', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({
      '/v1/zones': [{ status: 401 }, { status: 200 }],
      '/v1/drivers': [{ status: 401 }, { status: 200 }],
      '/v1/auth/refresh': [{ status: 200, data: ROTATED }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await Promise.all([
      customInstance({ url: '/v1/zones', method: 'GET' }),
      customInstance({ url: '/v1/drivers', method: 'GET' }),
    ]);
    expect(calls.filter((c) => c.url === '/v1/auth/refresh')).toHaveLength(1);
  });

  it('failed refresh clears tokens, fires onSessionExpired, propagates the error', async () => {
    setTokens(TOKENS);
    const onSessionExpired = vi.fn();
    const { adapter } = makeAdapter({
      '/v1/zones': [{ status: 401 }],
      '/v1/auth/refresh': [{ status: 401 }],
    });
    configureHttpClient({
      baseURL: 'http://api.test',
      adapter,
      onSessionExpired,
    });

    await expect(
      customInstance({ url: '/v1/zones', method: 'GET' }),
    ).rejects.toThrow();
    expect(getTokens()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not attempt refresh for /auth/login 401s (bad credentials)', async () => {
    const { adapter, calls } = makeAdapter({
      '/v1/auth/login': [{ status: 401 }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await expect(
      customInstance({ url: '/v1/auth/login', method: 'POST' }),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url === '/v1/auth/refresh')).toHaveLength(0);
  });

  it('retries at most once (second 401 propagates)', async () => {
    setTokens(TOKENS);
    const { adapter, calls } = makeAdapter({
      '/v1/zones': [{ status: 401 }, { status: 401 }],
      '/v1/auth/refresh': [{ status: 200, data: ROTATED }],
    });
    configureHttpClient({ baseURL: 'http://api.test', adapter });

    await expect(
      customInstance({ url: '/v1/zones', method: 'GET' }),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url === '/v1/auth/refresh')).toHaveLength(1);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @logidash/api-client test` — expected:
      FAIL (`custom-instance` not found).

- [ ] **Step 3: Implement** (`custom-instance.ts`):

```ts
import Axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  clearTokens,
  getTokens,
  setTokens,
  type AuthTokens,
} from './token-storage';

export interface HttpClientConfig {
  baseURL: string;
  /** Fired after a failed silent refresh — the session is unrecoverable. */
  onSessionExpired?: () => void;
  /** Test seam: lets unit tests stub the transport. */
  adapter?: AxiosAdapter;
}

/** Matches AuthTokensDto from the API contract (extra fields ignored). */
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_PATH = '/v1/auth/refresh';
const NO_RETRY_PATHS = [
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
];

let instance: AxiosInstance | null = null;
let clientConfig: HttpClientConfig | null = null;
let refreshInFlight: Promise<AuthTokens> | null = null;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function isRetriableAuthError(
  error: unknown,
): error is AxiosError & { config: RetriableConfig } {
  if (!Axios.isAxiosError(error)) return false;
  if (error.response?.status !== 401 || !error.config) return false;
  if ((error.config as RetriableConfig)._retried) return false;
  const url = error.config.url ?? '';
  return !NO_RETRY_PATHS.some((path) => url.includes(path));
}

async function refreshTokens(): Promise<AuthTokens> {
  // Single-flight: concurrent 401s share one refresh; rotation means a
  // second concurrent refresh with the same token would be reuse-detected.
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<AuthTokens> {
  const current = getTokens();
  if (!current) {
    expireSession();
    throw new Error('No refresh token available');
  }
  try {
    // Bare axios, NOT the instance: must not recurse through interceptors.
    const { data } = await Axios.post<RefreshResponse>(
      REFRESH_PATH,
      { refreshToken: current.refreshToken },
      { baseURL: clientConfig?.baseURL, adapter: clientConfig?.adapter },
    );
    const next = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
    setTokens(next);
    return next;
  } catch (error) {
    expireSession();
    throw error;
  }
}

function expireSession(): void {
  clearTokens();
  clientConfig?.onSessionExpired?.();
}

/** Call once at app startup, before any generated hook runs. */
export function configureHttpClient(config: HttpClientConfig): AxiosInstance {
  clientConfig = config;
  refreshInFlight = null;
  instance = Axios.create({ baseURL: config.baseURL, adapter: config.adapter });

  instance.interceptors.request.use((request) => {
    const tokens = getTokens();
    if (tokens) {
      request.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return request;
  });

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isRetriableAuthError(error)) throw error;
    error.config._retried = true;
    await refreshTokens();
    // Request interceptor re-attaches the (now rotated) access token.
    return instance!.request(error.config);
  });

  return instance;
}

/** Orval mutator: every generated hook funnels through here. */
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  if (!instance) {
    throw new Error(
      'HTTP client not configured — call configureHttpClient({ baseURL }) at app startup',
    );
  }
  return instance.request<T>(config).then((response) => response.data);
};

/** Lets Orval type hook errors as AxiosError<ErrorResponseDto>. */
export type ErrorType<TError> = AxiosError<TError>;
```

- [ ] **Step 4:** Run `pnpm --filter @logidash/api-client test` — expected:
      PASS (12 tests total). Then `pnpm --filter @logidash/api-client typecheck` —
      expected: clean. (If axios header typing fights `headers.Authorization =`,
      use `request.headers.set('Authorization', ...)` — axios ≥1.x exposes
      `AxiosHeaders#set`.)

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/http
git commit -m "feat(api-client): axios mutator with bearer attach + single-flight silent refresh"
```

---

### Task 9: Generate the client + public exports

**Files:**

- Modify: root `package.json`, `packages/api-client/src/index.ts`
- Create (generated): `packages/api-client/src/generated/**`

- [ ] **Step 1:** Add the root script:

```json
"gen:client": "pnpm --filter @logidash/api-client generate && pnpm --filter @logidash/api-client typecheck",
"gen": "pnpm gen:openapi && pnpm gen:client",
```

- [ ] **Step 2:** Run `pnpm gen:client`. Expected: Orval writes
      `src/generated/model/*.ts` (one file per schema: `zoneDto.ts`,
      `errorResponseDto.ts`, `role.ts`, …) and
      `src/generated/endpoints/<tag>/<tag>.ts` for tags
      `auth, users, zones, vehicles, drivers, deliveries, recommendations,
assignments, health`; typecheck passes.

- [ ] **Step 3:** Confirm git sees the output:
      `git check-ignore packages/api-client/src/generated/model/zoneDto.ts` must
      match **nothing** — if a root `.gitignore` pattern (e.g. for Prisma's
      generated client) catches it, scope that pattern to `apps/api/src/generated/`.

- [ ] **Step 4:** Replace the placeholder `src/index.ts`:

```ts
// Hand-written HTTP layer (auth attach + silent refresh).
export {
  configureHttpClient,
  customInstance,
  type ErrorType,
  type HttpClientConfig,
} from './http/custom-instance';
export {
  clearTokens,
  getTokens,
  setTokens,
  type AuthTokens,
} from './http/token-storage';

// Orval output. Regenerate with `pnpm gen` — never edit by hand.
export * from './generated/model';
export * from './generated/endpoints/auth/auth';
export * from './generated/endpoints/users/users';
export * from './generated/endpoints/zones/zones';
export * from './generated/endpoints/vehicles/vehicles';
export * from './generated/endpoints/drivers/drivers';
export * from './generated/endpoints/deliveries/deliveries';
export * from './generated/endpoints/recommendations/recommendations';
export * from './generated/endpoints/assignments/assignments';
export * from './generated/endpoints/health/health';
```

(Adjust paths to the folder names Orval actually produced — `ls
packages/api-client/src/generated/endpoints`. If `model` has no barrel
`index.ts`, point the export at the file Orval generated instead.)

- [ ] **Step 5:** `pnpm --filter @logidash/api-client typecheck && pnpm --filter @logidash/api-client test` — expected: clean + 12 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src package.json
git commit -m "feat(api-client): orval-generated react-query client + public package exports"
```

---

### Task 10: Wire `@logidash/web` to the generated client

**Files:**

- Modify: `apps/web/package.json`, `apps/web/src/main.tsx`, `apps/web/src/vite-env.d.ts`
- Create: `apps/web/src/lib/api.ts`, `apps/web/.env.example`

- [ ] **Step 1:** Add deps (axios + react-query satisfy api-client's peers):

```bash
pnpm --filter @logidash/web add axios @tanstack/react-query
pnpm --filter @logidash/web add @logidash/api-client --workspace
```

- [ ] **Step 2:** Type the env var — append to `apps/web/src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Create `apps/web/.env.example`:

```
# Base URL of the logidash API (no trailing slash; routes carry /v1 themselves)
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 3:** Create `apps/web/src/lib/api.ts`:

```ts
import { configureHttpClient } from '@logidash/api-client';

// Configure the shared API client once, at module load, before any
// generated hook can fire. Phase 8 adds onSessionExpired -> login redirect.
configureHttpClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

// Compile-time proof the app consumes generated contract types only.
export type { DeliveryDto, ZoneDto } from '@logidash/api-client';
```

In `apps/web/src/main.tsx`, add `import './lib/api';` as the first import.

- [ ] **Step 4:** Verify the done-when:

```bash
pnpm --filter @logidash/web build && pnpm --filter @logidash/web lint:check
```

Expected: `tsc -b` type-checks the generated types through the workspace
package; Vite build succeeds; lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): configure @logidash/api-client and type-check against generated types"
```

---

### Task 11: CI contract-drift check

**Files:**

- Modify: `.github/workflows/ci.yml` (quality job)

- [ ] **Step 1:** Append to the `quality` job after `- run: pnpm test`:

```yaml
- run: pnpm gen:openapi
- run: pnpm gen:client
- name: Contract drift check
  run: git diff --exit-code -- apps/api/openapi.json packages/api-client/src/generated
```

(`pnpm test` already runs the api-client vitest suite via `pnpm -r test`;
`gen:client` includes the package typecheck. The emit script provides its own
placeholder env, so the quality job needs no DB or secrets.)

- [ ] **Step 2:** Sanity-check locally that a clean tree stays clean:

```bash
pnpm gen
git diff --stat -- apps/api/openapi.json packages/api-client/src/generated
```

Expected: empty diff.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce contract/client freshness with a drift check"
```

---

### Task 12: Root README — the contract-first workflow

**Files:**

- Create: `README.md` (repo root — none exists today)

- [ ] **Step 1:** Write a focused README (full portfolio polish is Phase 9).
      Required sections + content:

1. **logidash** — one-paragraph pitch (backend-first logistics dispatch API:
   NestJS + Prisma/PostgreSQL, deterministic explainable driver
   recommendations, React command-center demo client).
2. **Monorepo layout** — `apps/api` (NestJS), `apps/web` (React/Vite),
   `packages/api-client` (generated contract client).
3. **Quickstart** — `docker compose up -d` (Postgres on **5433**),
   `pnpm install`, `cp apps/api/.env.example apps/api/.env` (set a ≥32-char
   `JWT_SECRET`), `pnpm db:migrate`, `pnpm db:seed` (demo accounts, password
   `Demo123!`), `pnpm dev` (API :3000, web :5173, Swagger at `/docs`).
4. **Contract-first workflow** — the centerpiece:

   ```
   NestJS controllers + DTOs (@nestjs/swagger decorators)
        │  pnpm gen:openapi
        ▼
   apps/api/openapi.json            (committed contract artifact)
        │  pnpm gen:client          (Orval, react-query mode)
        ▼
   packages/api-client/src/generated   (typed TanStack Query hooks + models)
        ▼
   apps/web                         (consumes generated types only)
   ```

   Rules: never edit `src/generated/` or `openapi.json` by hand; after any
   controller/DTO change run `pnpm gen` and commit the artifacts; CI fails on
   drift. Auth: the client attaches the bearer token automatically and
   silently refreshes on 401 via the rotating refresh-token flow (tokens in
   localStorage — standard SPA demo trade-off; rotation + reuse detection
   limit stolen-refresh-token damage).

5. **Scripts table** — `dev`, `build`, `test`, `gen:openapi`, `gen:client`,
   `gen`, `db:*`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: root README with quickstart and contract-first workflow"
```

---

### Task 13: Docs sync + full verification

**Files:**

- Modify: `docs/context/progress-tracker.md`, `docs/implementation-plan.md`,
  `docs/implementation-tools.md`

- [ ] **Step 1:** Full-suite verification (Docker Postgres on 5433 must be up):

```bash
pnpm build && pnpm lint:check && pnpm format:check && pnpm test && pnpm --filter @logidash/api test:e2e
```

Expected: build OK; lint/format clean; **151 unit (api) + 12 unit (api-client)**;
**43 e2e** green. Then `pnpm gen && git status --porcelain` — expected: no
modified files (artifacts in sync).

- [ ] **Step 2:** Update docs:
- `docs/implementation-plan.md`: tick Phase 7 tasks ☐→☑, add a Status block
  (what shipped, test counts, branch name).
- `docs/context/progress-tracker.md`: Phase 7 complete entry (Current Phase +
  Completed + Session Notes), set **Next: Phase 8 — Frontend Command Center**.
- `docs/implementation-tools.md`: correct the stale mutator path
  (`frontend/src/lib/http.ts` → `packages/api-client/src/http/custom-instance.ts`)
  and note the committed-artifact + CI-drift-check decisions.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: sync tracker and implementation plan for phase 7"
```

---

## Verification (phase "done when")

1. **Contract change regenerates the client:** edit any DTO (e.g. add a dummy
   `@ApiProperty() note?: string` to `ZoneDto`), run `pnpm gen` → the diff
   shows `openapi.json` + `zoneDto.ts` updating; revert.
2. **Frontend type-checks against generated types only:**
   `pnpm --filter @logidash/web build` passes and `apps/web/src/lib/api.ts`
   imports types from `@logidash/api-client` only.
3. **Silent refresh proven by unit tests** (Task 8's 7 interceptor cases).
4. **CI green** on the branch push: quality (incl. drift check) + e2e jobs.
5. Live smoke (optional): boot API + seeded DB, open `/docs`, confirm error
   schemas and `Try it out` login with seeded credentials works.

## Execution notes / gotchas

- **Import hoisting:** the gen script must set placeholder env _before_
  `AppModule` loads — keep the dynamic `await import('../app.module')`.
- **Never `app.init()`/`listen()` in the gen script** — that's what keeps
  Prisma from connecting (lifecycle hooks don't run).
- Pre-commit hook reverts commits on non-fixable ESLint errors — run
  `lint:check` before committing api changes (known from Phases 4/6).
- If `pnpm -r test` chokes because some package lacks a `test` script, that's
  pre-existing behavior (web has none) — pnpm skips missing scripts.
- Orval output names (`zoneDto.ts` casing, endpoint folder names) may differ
  slightly by version — adjust `index.ts` re-exports to what's actually on
  disk, don't fight it.
- After pulling on another machine: `pnpm install` before anything (lockfile
  gains orval/axios/react-query/vitest).
