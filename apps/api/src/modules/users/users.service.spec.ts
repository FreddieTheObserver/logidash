import { ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role, UserStatus } from '../../generated/prisma/enums';
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
    const calls = prisma.user.create.mock.calls as Array<
      [{ data: { passwordHash: string } }]
    >;
    const created = calls[0][0].data;
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
