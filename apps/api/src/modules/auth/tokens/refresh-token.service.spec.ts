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
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    const calls = prisma.refreshToken.create.mock.calls as Array<
      [{ data: { userId: string; tokenHash: string } }]
    >;
    const { data } = calls[0][0];
    expect(data.userId).toBe('user-1');
    expect(data.tokenHash).toBe(sha256(token));
    expect(data.tokenHash).not.toBe(token);
  });

  it('mint prunes the user’s already-expired tokens', async () => {
    await service.mint('user-1');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        expiresAt: { lt: expect.any(Date) as unknown },
      },
    });
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
      data: { revokedAt: expect.any(Date) as unknown },
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
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });
});
