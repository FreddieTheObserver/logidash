import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Env } from '../../config/env.validation';
import { UserStatus } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models/User';
import { UsersService } from '../users/users.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AccessTokenService } from './tokens/access-token.service';
import { RefreshTokenService } from './tokens/refresh-token.service';

@Injectable()
export class AuthService implements OnModuleInit {
  /**
   * A real argon2 hash of a random throwaway secret, verified against when no
   * user matches so the unknown-email and wrong-password paths cost the same —
   * closing the timing side channel that would otherwise enumerate accounts.
   */
  private decoyHash!: string;

  constructor(
    private readonly users: UsersService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.decoyHash = await argon2.hash(randomBytes(32).toString('hex'));
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.users.findByEmail(dto.email);
    // Always run a verify (against a decoy hash when the user is unknown) so the
    // response time does not reveal whether the email exists.
    const passwordValid = await argon2.verify(
      user?.passwordHash ?? this.decoyHash,
      dto.password,
    );
    if (!user || !passwordValid) {
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

  private async issueTokens(user: UserModel): Promise<AuthTokensDto> {
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
