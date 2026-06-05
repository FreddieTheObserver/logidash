import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Role, UserStatus } from '../../generated/prisma/enums';
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
