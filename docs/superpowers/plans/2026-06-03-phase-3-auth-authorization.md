# Phase 3 — Auth & Authorization Implementation Plan

> **For agentic workers:** This plan will be executed **teach-and-build** style
> (the user types the code with guidance), per the user's chosen execution mode.
> Steps use checkbox (`- [ ]`) syntax for tracking. Brainstorming and the design
> spec are already locked — implement against them, do not re-derive product
> behavior.

**Goal:** JWT authentication with four roles (`admin`/`dispatcher`/`driver`/`viewer`) enforced server-side, using access + short-lived refresh tokens with rotation.

**Architecture:** A new `auth/` domain module owns login/refresh/logout and token services; a `users/` module owns admin-only user CRUD and exposes a `UsersService` consumed by auth. Cross-cutting auth primitives (decorators, guards, the `AuthUser` type) live in `common/`. Access tokens are short-lived signed JWTs (HS256, ~15m); refresh tokens are opaque high-entropy strings stored as SHA-256 hashes in a new `RefreshToken` table, rotated on every refresh and revocable on logout. Two global guards run in order: `JwtAuthGuard` (authenticate, honoring a `@Public()` opt-out) then `RolesGuard` (authorize against `@Roles()`).

**Tech Stack:** NestJS 11, `@nestjs/passport` + `passport-jwt` + `@nestjs/jwt`, `argon2` (already present) for password hashing, `@nestjs/swagger` for the bearer security scheme, Prisma 7, Jest + supertest. Node's built-in `crypto` for refresh-token generation/hashing.

---

## Token Strategy (locked decision)

- **Access token:** signed JWT, payload `{ sub: userId, email, role }`, `expiresIn` from `JWT_ACCESS_TTL` (default `15m`). Verified by `passport-jwt` on every protected request.
- **Refresh token:** opaque `randomBytes(32).toString('base64url')`. Stored only as a SHA-256 hash (`tokenHash`, unique-indexed) in `RefreshToken`, with `expiresAt` (default 7 days) and nullable `revokedAt`.
- **Rotation:** `POST /auth/refresh` validates the presented refresh token, revokes it, and issues a brand-new access + refresh pair in one transaction.
- **Reuse detection:** presenting an already-revoked refresh token revokes _all_ of that user's active refresh tokens and returns 401 (theft signal).
- **Logout:** `POST /auth/logout` revokes the presented refresh token.
- `/auth/login`, `/auth/refresh`, `/auth/logout` are `@Public()` (they authenticate via body credentials / the refresh token, not an access token).

## Error semantics for this phase

- `400` — DTO validation failure (handled by the existing global `ValidationPipe`).
- `401` — bad/expired/revoked credentials or token (`UnauthorizedException`).
- `403` — authenticated but role-forbidden, or disabled account (`ForbiddenException`).
- `409` — duplicate email on user create (`ConflictException`).

> The formal global exception filter + standardized `{ statusCode, error, message, details? }` body is **Phase 4** scope. Phase 3 relies on Nest's built-in exception responses, which already carry `statusCode`/`message`/`error`.

## File Structure

**New files**

- `backend/src/common/types/auth-user.ts` — `AuthUser` interface attached to `req.user`.
- `backend/src/common/decorators/public.decorator.ts` — `@Public()` + `IS_PUBLIC_KEY`.
- `backend/src/common/decorators/roles.decorator.ts` — `@Roles(...)` + `ROLES_KEY`.
- `backend/src/common/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator.
- `backend/src/common/guards/jwt-auth.guard.ts` — global JWT guard honoring `@Public()`.
- `backend/src/common/guards/roles.guard.ts` — global role guard honoring `@Roles()`.
- `backend/src/users/users.service.ts` + `.spec.ts` — user data access + admin CRUD logic.
- `backend/src/users/users.controller.ts` — admin-only user endpoints.
- `backend/src/users/users.module.ts` — exports `UsersService`.
- `backend/src/users/dto/create-user.dto.ts`, `update-user.dto.ts`, `user.dto.ts`.
- `backend/src/auth/auth.service.ts` + `.spec.ts` — login/refresh/logout orchestration.
- `backend/src/auth/auth.controller.ts` — `login`/`refresh`/`logout`/`me`.
- `backend/src/auth/auth.module.ts` — wires JwtModule, strategy, services, global guards.
- `backend/src/auth/tokens/access-token.service.ts` + `.spec.ts` — sign access JWTs.
- `backend/src/auth/tokens/refresh-token.service.ts` + `.spec.ts` — mint/rotate/revoke refresh tokens.
- `backend/src/auth/strategies/jwt.strategy.ts` — passport-jwt strategy → `AuthUser`.
- `backend/src/auth/dto/login.dto.ts`, `refresh.dto.ts`, `logout.dto.ts`, `auth-tokens.dto.ts`.
- `backend/test/auth.e2e-spec.ts` — role-matrix + token-flow e2e.

**Modified files**

- `backend/prisma/schema.prisma` — add `RefreshToken` model + `User.refreshTokens` relation.
- `backend/src/config/env.validation.ts` — `JWT_SECRET` required; add `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DAYS`.
- `backend/.env.example` — document new auth env vars.
- `backend/test/setup-e2e.ts` — bump `JWT_SECRET` to ≥16 chars.
- `backend/src/app.module.ts` — import `AuthModule` + `UsersModule`.
- `backend/src/main.ts` — Swagger document + `addBearerAuth()` + `SwaggerModule.setup('docs', …)`.
- `backend/src/health/health.controller.ts` — mark `@Public()` (stays open under the global guard).
- `backend/package.json` — new dependencies (via `npm install`).
- `docs/context/architecture.md`, `docs/implementation-plan.md`, `docs/context/progress-tracker.md` — sync docs.

---

## Task 1: Dependencies & environment

**Files:**

- Modify: `backend/package.json` (via npm)
- Modify: `backend/src/config/env.validation.ts`
- Modify: `backend/.env.example`
- Modify: `backend/test/setup-e2e.ts`

- [ ] **Step 1: Install auth + swagger packages**

Run from the repo root:

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt @nestjs/swagger -w backend
npm install -D @types/passport-jwt -w backend
```

Expected: packages added to `backend/package.json`; no peer-dependency errors against NestJS 11.

- [ ] **Step 2: Require JWT_SECRET and add token TTLs in the env schema**

In `backend/src/config/env.validation.ts`, replace the reserved JWT line with required + TTL config:

```ts
  // Auth (Phase 3). JWT_SECRET is now required; the app must not boot without it.
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
```

Leave `ORS_API_KEY` / `ORS_BASE_URL` unchanged.

- [ ] **Step 3: Update `.env.example`**

In `backend/.env.example`, replace the auth block with:

```
# Auth (Phase 3+). JWT_SECRET must be at least 16 characters.
JWT_SECRET=change-me-in-development-please
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=7
```

- [ ] **Step 4: Make the e2e secret valid**

In `backend/test/setup-e2e.ts`, bump the secret to satisfy `min(16)`:

```ts
process.env.JWT_SECRET ??= 'test-secret-test-secret-0123456789';
```

- [ ] **Step 5: Verify the app still validates env**

Run: `npm run build -w backend`
Expected: PASS (compiles; env types include the new fields).

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config/env.validation.ts backend/.env.example backend/test/setup-e2e.ts
git commit -m "chore(auth): add auth/swagger deps and require JWT env (Phase 3)"
```

---

## Task 2: RefreshToken schema + migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_refresh_token/` (generated)

> Schema/migration changes are isolated from feature logic per `ai-workflow-rules.md`. Docker Postgres must be up on host port **5433** (`docker compose up -d`).

- [ ] **Step 1: Add the `refreshTokens` relation to `User`**

In `backend/prisma/schema.prisma`, inside `model User { … }`, add to the relations block:

```prisma
  refreshTokens               RefreshToken[]
```

- [ ] **Step 2: Add the `RefreshToken` model**

After the `User` model (or near the auth-related models), add:

```prisma
model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 3: Create and apply the migration**

Run: `npm run db:migrate -w backend -- --name add_refresh_token`
Expected: a new migration directory is created, applied to the 5433 DB, and the Prisma client regenerates so `prisma.refreshToken` exists.

- [ ] **Step 4: Verify the client picks up the model**

Run: `npm run build -w backend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/generated
git commit -m "feat(auth): add RefreshToken model and migration (Phase 3)"
```

---

## Task 3: Common auth primitives (types, decorators)

**Files:**

- Create: `backend/src/common/types/auth-user.ts`
- Create: `backend/src/common/decorators/public.decorator.ts`
- Create: `backend/src/common/decorators/roles.decorator.ts`
- Create: `backend/src/common/decorators/current-user.decorator.ts`

> These are metadata/type declarations with no behavior to unit-test in isolation; they are exercised by the guards (Task 8) and the e2e (Task 10).

- [ ] **Step 1: `AuthUser` type**

`backend/src/common/types/auth-user.ts`:

```ts
import { Role } from '../../generated/prisma/enums';

/** The authenticated principal attached to `req.user` by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
```

- [ ] **Step 2: `@Public()` decorator**

`backend/src/common/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route (or controller) as exempt from the global JWT auth guard. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 3: `@Roles()` decorator**

`backend/src/common/decorators/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the listed roles. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 4: `@CurrentUser()` param decorator**

`backend/src/common/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user';

/** Resolves the authenticated `AuthUser` from the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
```

- [ ] **Step 5: Verify compile + commit**

Run: `npm run build -w backend`
Expected: PASS.

```bash
git add backend/src/common
git commit -m "feat(auth): add AuthUser type and auth decorators (Phase 3)"
```

---

## Task 4: Access token service (TDD)

**Files:**

- Create: `backend/src/auth/tokens/access-token.service.ts`
- Test: `backend/src/auth/tokens/access-token.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`backend/src/auth/tokens/access-token.service.spec.ts`:

```ts
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../generated/prisma/enums';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret-test-secret-0123456789' });
  const service = new AccessTokenService(jwt);

  it('signs a token carrying sub, email, and role', async () => {
    const token = await service.sign({
      id: 'user-1',
      email: 'a@logidash.dev',
      role: Role.admin,
    });
    const decoded = jwt.decode<{ sub: string; email: string; role: Role }>(
      token,
    );
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('a@logidash.dev');
    expect(decoded.role).toBe(Role.admin);
  });
});
```

- [ ] **Step 2: Run it (fails — module not found)**

Run: `npm test -w backend -- access-token`
Expected: FAIL (`Cannot find module './access-token.service'`).

- [ ] **Step 3: Implement**

`backend/src/auth/tokens/access-token.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../generated/prisma/enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  /** Signs a short-lived access token (expiry comes from JwtModule config). */
  async sign(user: { id: string; email: string; role: Role }): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.signAsync(payload);
  }
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -w backend -- access-token`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/tokens/access-token.service.ts backend/src/auth/tokens/access-token.service.spec.ts
git commit -m "feat(auth): add access token service (Phase 3)"
```

---

## Task 5: Refresh token service (TDD)

**Files:**

- Create: `backend/src/auth/tokens/refresh-token.service.ts`
- Test: `backend/src/auth/tokens/refresh-token.service.spec.ts`

> Prisma is mocked here — pure logic, no DB needed.

- [ ] **Step 1: Write the failing test**

`backend/src/auth/tokens/refresh-token.service.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { RefreshTokenService } from './refresh-token.service';

const sha256 = (t: string): string =>
  createHash('sha256').update(t).digest('hex');

function makePrismaMock() {
  return {
    refreshToken: {
      create: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const config = {
  get: jest.fn().mockReturnValue(7), // JWT_REFRESH_TTL_DAYS
} as unknown as ConfigService;

describe('RefreshTokenService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: RefreshTokenService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new RefreshTokenService(prisma as never, config);
  });

  it('mint stores a SHA-256 hash (never the raw token) and returns the raw token', async () => {
    const token = await service.mint('user-1');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.userId).toBe('user-1');
    expect(data.tokenHash).toBe(sha256(token));
    expect(data.tokenHash).not.toBe(token);
  });

  it('rotate rejects an unknown token with 401', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate rejects an expired token with 401', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.rotate('expired')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotate detects reuse: revokes all of the user’s tokens and throws 401', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });
    await expect(service.rotate('reused')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rotate revokes the old token and issues a new one for a valid token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
    });
    const result = await service.rotate('valid');
    expect(result.userId).toBe('user-1');
    expect(typeof result.refreshToken).toBe('string');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('revoke marks the matching active token revoked', async () => {
    await service.revoke('some-token');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('some-token'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Run it (fails — module not found)**

Run: `npm test -w backend -- refresh-token`
Expected: FAIL.

- [ ] **Step 3: Implement**

`backend/src/auth/tokens/refresh-token.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generate(): string {
    return randomBytes(32).toString('base64url');
  }

  private expiry(): Date {
    const days = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  /** Issues a new opaque refresh token and persists its hash. */
  async mint(userId: string): Promise<string> {
    const token = this.generate();
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hash(token), expiresAt: this.expiry() },
    });
    return token;
  }

  /**
   * Validates a refresh token, then rotates it: revoke the old, mint a new one,
   * in a single transaction. Reuse of a revoked token revokes the whole family.
   */
  async rotate(
    token: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const newToken = this.generate();
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: this.hash(newToken),
          expiresAt: this.expiry(),
        },
      }),
    ]);

    return { userId: record.userId, refreshToken: newToken };
  }

  /** Revokes the presented refresh token (logout). */
  async revoke(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -w backend -- refresh-token`
Expected: PASS (all 6 cases green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/tokens/refresh-token.service.ts backend/src/auth/tokens/refresh-token.service.spec.ts
git commit -m "feat(auth): add refresh token service with rotation + reuse detection (Phase 3)"
```

---

## Task 6: Users module — DTOs, service (TDD), controller

**Files:**

- Create: `backend/src/users/dto/user.dto.ts`, `create-user.dto.ts`, `update-user.dto.ts`
- Create: `backend/src/users/users.service.ts`
- Test: `backend/src/users/users.service.spec.ts`
- Create: `backend/src/users/users.controller.ts`
- Create: `backend/src/users/users.module.ts`

- [ ] **Step 1: DTOs**

`backend/src/users/dto/user.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Role, UserStatus } from '../../generated/prisma/enums';

/** Public user shape — never includes passwordHash. */
export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

`backend/src/users/dto/create-user.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role, UserStatus } from '../../generated/prisma/enums';

export class CreateUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) password!: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
```

`backend/src/users/dto/update-user.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role, UserStatus } from '../../generated/prisma/enums';

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
```

- [ ] **Step 2: Write the failing service test**

`backend/src/users/users.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role, UserStatus } from '../generated/prisma/enums';
import { UsersService } from './users.service';

function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

const baseUser = {
  id: 'u1',
  email: 'a@logidash.dev',
  name: 'A',
  role: Role.viewer,
  status: UserStatus.active,
  passwordHash: 'hash',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new UsersService(prisma as never);
  });

  it('create hashes the password and never returns passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(baseUser);
    const dto = {
      email: 'a@logidash.dev',
      name: 'A',
      password: 'password1',
      role: Role.viewer,
    };
    const result = await service.create(dto);
    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.passwordHash).not.toBe('password1');
    await expect(
      argon2.verify(created.passwordHash, 'password1'),
    ).resolves.toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.email).toBe('a@logidash.dev');
  });

  it('create rejects a duplicate email with 409', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await expect(
      service.create({
        email: 'a@logidash.dev',
        name: 'A',
        password: 'password1',
        role: Role.viewer,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('getById throws 404 when missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list maps every row to the safe shape', async () => {
    prisma.user.findMany.mockResolvedValue([baseUser]);
    const result = await service.list();
    expect(result[0]).not.toHaveProperty('passwordHash');
  });
});
```

- [ ] **Step 3: Run it (fails)**

Run: `npm test -w backend -- users.service`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the service**

`backend/src/users/users.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserStatus } from '../generated/prisma/enums';
import type { User } from '../generated/prisma/models/User';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto } from './dto/user.dto';

function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Internal: full row incl. passwordHash — for auth only, never returned to clients. */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        status: dto.status ?? UserStatus.active,
        passwordHash,
      },
    });
    return toUserDto(user);
  }

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toUserDto);
  }

  async getById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserDto(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    await this.getById(id); // 404 if missing
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...dto },
    });
    return toUserDto(user);
  }
}
```

> If the `User` model import path differs, confirm it against `backend/src/generated/prisma/models/User.ts`. If TS cannot resolve the named type, fall back to `import type { Prisma } from '../generated/prisma/client'` and type rows as the `user.findUnique` return — but the `models/User` path matches the existing generated layout.

- [ ] **Step 5: Run it (passes)**

Run: `npm test -w backend -- users.service`
Expected: PASS.

- [ ] **Step 6: Controller (admin-only)**

`backend/src/users/users.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Get()
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<UserDto> {
    return this.users.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.update(id, dto);
  }
}
```

- [ ] **Step 7: Module**

`backend/src/users/users.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 8: Build + commit**

Run: `npm run build -w backend` → PASS.

```bash
git add backend/src/users
git commit -m "feat(users): add admin-only users module with safe DTOs (Phase 3)"
```

---

## Task 7: Auth service (TDD), DTOs, controller, JWT strategy

**Files:**

- Create: `backend/src/auth/dto/login.dto.ts`, `refresh.dto.ts`, `logout.dto.ts`, `auth-tokens.dto.ts`
- Create: `backend/src/auth/auth.service.ts`
- Test: `backend/src/auth/auth.service.spec.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/strategies/jwt.strategy.ts`

- [ ] **Step 1: DTOs**

`backend/src/auth/dto/login.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@logidash.dev' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'Demo123!' })
  @IsString()
  @MinLength(1)
  password!: string;
}
```

`backend/src/auth/dto/refresh.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty() @IsString() @MinLength(1) refreshToken!: string;
}
```

`backend/src/auth/dto/logout.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @ApiProperty() @IsString() @MinLength(1) refreshToken!: string;
}
```

`backend/src/auth/dto/auth-tokens.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: string;
  @ApiProperty({ example: '15m' }) expiresIn!: string;
}
```

- [ ] **Step 2: Write the failing auth service test**

`backend/src/auth/auth.service.spec.ts`:

```ts
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Role, UserStatus } from '../generated/prisma/enums';
import { AccessTokenService } from './tokens/access-token.service';
import { RefreshTokenService } from './tokens/refresh-token.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const config = {
    get: jest.fn().mockReturnValue('15m'),
  } as unknown as ConfigService;
  let users: { findByEmail: jest.Mock; findById: jest.Mock };
  let accessTokens: { sign: jest.Mock };
  let refreshTokens: { mint: jest.Mock; rotate: jest.Mock; revoke: jest.Mock };
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('Demo123!');
  });

  beforeEach(() => {
    users = { findByEmail: jest.fn(), findById: jest.fn() };
    accessTokens = { sign: jest.fn().mockResolvedValue('access.jwt') };
    refreshTokens = {
      mint: jest.fn().mockResolvedValue('refresh-1'),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      users as never,
      accessTokens as unknown as AccessTokenService,
      refreshTokens as unknown as RefreshTokenService,
      config,
    );
  });

  const activeUser = {
    id: 'u1',
    email: 'admin@logidash.dev',
    name: 'Admin',
    role: Role.admin,
    status: UserStatus.active,
    passwordHash: '',
  };

  it('login returns tokens for valid credentials', async () => {
    users.findByEmail.mockResolvedValue({ ...activeUser, passwordHash });
    const result = await service.login({
      email: activeUser.email,
      password: 'Demo123!',
    });
    expect(result.accessToken).toBe('access.jwt');
    expect(result.refreshToken).toBe('refresh-1');
    expect(result.tokenType).toBe('Bearer');
  });

  it('login rejects an unknown email with 401', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@y.z', password: 'Demo123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login rejects a wrong password with 401', async () => {
    users.findByEmail.mockResolvedValue({ ...activeUser, passwordHash });
    await expect(
      service.login({ email: activeUser.email, password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login rejects a disabled account with 403', async () => {
    users.findByEmail.mockResolvedValue({
      ...activeUser,
      passwordHash,
      status: UserStatus.disabled,
    });
    await expect(
      service.login({ email: activeUser.email, password: 'Demo123!' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refresh rotates the token and issues a fresh access token', async () => {
    refreshTokens.rotate.mockResolvedValue({
      userId: 'u1',
      refreshToken: 'refresh-2',
    });
    users.findById.mockResolvedValue(activeUser);
    const result = await service.refresh({ refreshToken: 'refresh-1' });
    expect(result.refreshToken).toBe('refresh-2');
    expect(result.accessToken).toBe('access.jwt');
  });

  it('logout revokes the presented refresh token', async () => {
    await service.logout({ refreshToken: 'refresh-1' });
    expect(refreshTokens.revoke).toHaveBeenCalledWith('refresh-1');
  });
});
```

- [ ] **Step 3: Run it (fails)**

Run: `npm test -w backend -- auth.service`
Expected: FAIL.

- [ ] **Step 4: Implement the auth service**

`backend/src/auth/auth.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { Env } from '../config/env.validation';
import { UserStatus } from '../generated/prisma/enums';
import type { User } from '../generated/prisma/models/User';
import { UsersService } from '../users/users.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AccessTokenService } from './tokens/access-token.service';
import { RefreshTokenService } from './tokens/refresh-token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.disabled) {
      throw new ForbiddenException('Account is disabled');
    }
    return this.issueTokens(user);
  }

  async refresh(dto: RefreshDto): Promise<AuthTokensDto> {
    const { userId, refreshToken } = await this.refreshTokens.rotate(
      dto.refreshToken,
    );
    const user = await this.users.findById(userId);
    if (!user || user.status === UserStatus.disabled) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessToken = await this.accessTokens.sign(user);
    return this.buildTokens(accessToken, refreshToken);
  }

  async logout(dto: LogoutDto): Promise<void> {
    await this.refreshTokens.revoke(dto.refreshToken);
  }

  private async issueTokens(user: User): Promise<AuthTokensDto> {
    const accessToken = await this.accessTokens.sign(user);
    const refreshToken = await this.refreshTokens.mint(user.id);
    return this.buildTokens(accessToken, refreshToken);
  }

  private buildTokens(
    accessToken: string,
    refreshToken: string,
  ): AuthTokensDto {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    };
  }
}
```

- [ ] **Step 5: Run it (passes)**

Run: `npm test -w backend -- auth.service`
Expected: PASS.

- [ ] **Step 6: JWT strategy**

`backend/src/auth/strategies/jwt.strategy.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../../common/types/auth-user';
import type { Env } from '../../config/env.validation';
import { UserStatus } from '../../generated/prisma/enums';
import { UsersService } from '../../users/users.service';
import type { AccessTokenPayload } from '../tokens/access-token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /** Re-resolves the user from the DB so disabled/role-changed accounts are caught. */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || user.status === UserStatus.disabled) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
```

- [ ] **Step 7: Auth controller**

`backend/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AuthService } from './auth.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
```

- [ ] **Step 8: Build + commit**

Run: `npm run build -w backend` → PASS.

```bash
git add backend/src/auth
git commit -m "feat(auth): add auth service, DTOs, controller, and JWT strategy (Phase 3)"
```

---

## Task 8: Guards + global wiring

**Files:**

- Create: `backend/src/common/guards/jwt-auth.guard.ts`
- Create: `backend/src/common/guards/roles.guard.ts`
- Create: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/health/health.controller.ts`

- [ ] **Step 1: JWT auth guard (honors `@Public()`)**

`backend/src/common/guards/jwt-auth.guard.ts`:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

- [ ] **Step 2: Roles guard (honors `@Roles()`)**

`backend/src/common/guards/roles.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user';
import { Role } from '../../generated/prisma/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
```

- [ ] **Step 3: Auth module (wires JwtModule + global guards)**

`backend/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { Env } from '../config/env.validation';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AccessTokenService } from './tokens/access-token.service';
import { RefreshTokenService } from './tokens/refresh-token.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenService,
    RefreshTokenService,
    JwtStrategy,
    // Order matters: authenticate first, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
```

- [ ] **Step 4: Register modules in `AppModule`**

In `backend/src/app.module.ts`, add the imports:

```ts
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
```

and add `AuthModule` and `UsersModule` to the `imports` array (after `PrismaModule`).

- [ ] **Step 5: Keep `/health` public**

In `backend/src/health/health.controller.ts`, import and apply `@Public()` on the controller:

```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

// ...
@Public()
@Controller('health')
export class HealthController {
  // unchanged
}
```

- [ ] **Step 6: Build + run unit suite**

Run: `npm run build -w backend` → PASS.
Run: `npm test -w backend` → PASS (all unit specs green; health unit spec unaffected).

- [ ] **Step 7: Commit**

```bash
git add backend/src/common/guards backend/src/auth/auth.module.ts backend/src/app.module.ts backend/src/health/health.controller.ts
git commit -m "feat(auth): wire global JWT + roles guards with public opt-out (Phase 3)"
```

---

## Task 9: Swagger bearer security scheme

**Files:**

- Modify: `backend/src/main.ts`

- [ ] **Step 1: Add the Swagger document with bearer auth**

In `backend/src/main.ts`, add imports and set up Swagger **after** the global pipe/CORS but before `app.listen`:

```ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
```

```ts
const swaggerConfig = new DocumentBuilder()
  .setTitle('logidash API')
  .setDescription('Logistics dispatch API — authentication & authorization')
  .setVersion('0.1.0')
  .addBearerAuth()
  .build();
const document = SwaggerModule.createDocument(app, swaggerConfig);
SwaggerModule.setup('docs', app, document);
```

> The standalone `gen:openapi` emit script + Orval client are **Phase 7**. This task only exposes the live `/docs` UI and the bearer scheme so `@ApiBearerAuth()` annotations resolve.

- [ ] **Step 2: Verify the app boots and `/docs` serves**

Run (with Docker Postgres up on 5433): `npm run start:dev -w backend`
Then in another shell: `curl -s http://localhost:3000/docs-json | head -c 200` (or open `http://localhost:3000/docs`).
Expected: OpenAPI JSON includes a `bearer` security scheme and `auth`/`users` paths. Stop the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.ts
git commit -m "feat(auth): expose Swagger docs with bearer security scheme (Phase 3)"
```

---

## Task 10: Role-matrix + token-flow e2e

**Files:**

- Create: `backend/test/auth.e2e-spec.ts`

> Requires Docker Postgres on 5433. The suite creates its own four users (unique emails so they don't collide with seed data) and cleans them up.

- [ ] **Step 1: Write the e2e**

`backend/test/auth.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Role, UserStatus } from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const EMAILS = {
  admin: 'e2e.admin@logidash.test',
  dispatcher: 'e2e.dispatcher@logidash.test',
  driver: 'e2e.driver@logidash.test',
  viewer: 'e2e.viewer@logidash.test',
};

describe('Auth & roles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });
    await prisma.user.createMany({
      data: [
        {
          email: EMAILS.admin,
          name: 'E2E Admin',
          role: Role.admin,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.dispatcher,
          name: 'E2E Dispatcher',
          role: Role.dispatcher,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.driver,
          name: 'E2E Driver',
          role: Role.driver,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.viewer,
          name: 'E2E Viewer',
          role: Role.viewer,
          status: UserStatus.active,
          passwordHash,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });
    await app.close();
  });

  const login = async (email: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  it('GET /health is public (200 without a token)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /auth/me without a token is 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('login with bad password is 401', async () => {
    await login(EMAILS.admin, 'wrong').expect(401);
  });

  it('login succeeds and /auth/me returns the role', async () => {
    const res = await login(EMAILS.admin).expect(200);
    const { accessToken } = res.body as { accessToken: string };
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((me.body as { role: string }).role).toBe('admin');
  });

  it('admin can list users; other roles get 403', async () => {
    const tokens: Record<string, string> = {};
    for (const [role, email] of Object.entries(EMAILS)) {
      const res = await login(email).expect(200);
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    for (const role of ['dispatcher', 'driver', 'viewer']) {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(403);
    }
  });

  it('refresh rotates tokens and the old refresh token is rejected (reuse → 401)', async () => {
    const res = await login(EMAILS.dispatcher).expect(200);
    const { refreshToken } = res.body as { refreshToken: string };

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect((rotated.body as { refreshToken: string }).refreshToken).not.toBe(
      refreshToken,
    );

    // Presenting the now-revoked original token must fail.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const res = await login(EMAILS.viewer).expect(200);
    const { refreshToken } = res.body as { refreshToken: string };
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
```

- [ ] **Step 2: Run the e2e**

Run (Docker Postgres up): `npm run test:e2e -w backend`
Expected: PASS — health (1), auth (2), and all role-matrix/token-flow cases green.

- [ ] **Step 3: Commit**

```bash
git add backend/test/auth.e2e-spec.ts
git commit -m "test(auth): role-matrix and token-rotation e2e (Phase 3)"
```

---

## Task 11: Docs sync

**Files:**

- Modify: `docs/context/architecture.md`
- Modify: `docs/implementation-plan.md`
- Modify: `docs/context/progress-tracker.md`

- [ ] **Step 1: Architecture — record the RefreshToken table + chosen strategy**

In `docs/context/architecture.md`:

- In **Storage Model**, add a bullet noting `RefreshToken` (hashed token, expiry, revocation) persisted in Postgres for revocable refresh rotation.
- In **Auth and Access Model**, replace "(refresh-token strategy optional…)" with the chosen access + short-lived refresh + rotation strategy.

- [ ] **Step 2: Implementation plan — tick Phase 3 tasks**

In `docs/implementation-plan.md` Phase 3, change each `☐` to `☑` and add a `> **Status:** Done — …` note summarizing what shipped (modules, token strategy, e2e green).

- [ ] **Step 3: Progress tracker — advance the phase**

In `docs/context/progress-tracker.md`: move Phase 3 from "Current Goal" to "Completed", set Current Phase/Goal to Phase 4, and add a Phase 3 bullet under **Completed**.

- [ ] **Step 4: Final verification (whole backend)**

Run: `npm run build -w backend` → PASS.
Run: `npm run lint -w backend` → PASS.
Run: `npm test -w backend` → PASS (unit).
Run (Docker up): `npm run test:e2e -w backend` → PASS (e2e).

- [ ] **Step 5: Commit**

```bash
git add docs/context/architecture.md docs/implementation-plan.md docs/context/progress-tracker.md
git commit -m "docs: mark Phase 3 complete and record auth decisions"
```

---

## Self-Review

**Spec coverage (Phase 3 tasks from `implementation-plan.md`):**

- `AuthModule` (login, argon2, JWT issuance) → Tasks 4, 5, 7, 8. ✅
- Token strategy decided + implemented (access + refresh rotation) → Tasks 1, 2, 5, 7. ✅
- `JwtStrategy` + `@CurrentUser()` → Tasks 3, 7. ✅
- `@Roles()` + `RolesGuard` + global auth guard with public opt-out → Tasks 3, 8. ✅
- `UsersModule` (admin-only CRUD + role assignment) → Task 6. ✅
- Swagger bearer scheme → Tasks 6/7 annotations + Task 9 document. ✅
- Role-matrix e2e (four roles) → Task 10. ✅
- "Done when" (login works, protected routes reject unauth/forbidden, role-matrix e2e passes) → Task 10 proves all three. ✅

**Invariant check (`architecture.md`):** Invariant 1 (server-side enforcement) — global guards. Invariant 2 (validate all input at boundary) — DTOs + existing `ValidationPipe`. No invariant violated.

**Placeholder scan:** No "TBD"/"add validation"/"similar to Task N" — every code step shows full code. One conditional note (User type import path) gives an explicit fallback, not a placeholder.

**Type consistency:** `AuthUser { id,email,name,role }` used identically in the strategy, guards, `@CurrentUser`, and controller. `AccessTokenPayload { sub,email,role }` produced by `AccessTokenService.sign` and consumed by `JwtStrategy.validate`. `AuthTokensDto { accessToken, refreshToken, tokenType, expiresIn }` returned by every auth flow. `RefreshTokenService` methods `mint`/`rotate`/`revoke` match their call sites in `AuthService`. Role enum imported from `generated/prisma/enums` everywhere. Consistent.

**Out-of-scope deferrals (intentional):** global exception filter + standardized error envelope and the offset pagination envelope are **Phase 4**; `gen:openapi` emit + Orval client are **Phase 7**. Phase 3 uses Nest's built-in exception bodies and a plain array for `GET /users`.
