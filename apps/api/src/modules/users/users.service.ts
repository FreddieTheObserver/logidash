import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role, UserStatus } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models/User';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto } from './dto/user.dto';

function toUserDto(user: UserModel): UserDto {
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
  findByEmail(email: string): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<UserModel | null> {
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
    const current = await this.getById(id); // 404 if missing

    // Guard against locking everyone out of admin: block demoting or disabling
    // the last remaining active admin.
    const wouldRemoveAdmin =
      current.role === Role.admin &&
      current.status === UserStatus.active &&
      ((dto.role !== undefined && dto.role !== Role.admin) ||
        dto.status === UserStatus.disabled);
    if (wouldRemoveAdmin) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: Role.admin, status: UserStatus.active },
      });
      if (activeAdmins <= 1) {
        throw new ConflictException(
          'Cannot demote or disable the last active admin',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { ...dto },
    });
    return toUserDto(user);
  }
}
