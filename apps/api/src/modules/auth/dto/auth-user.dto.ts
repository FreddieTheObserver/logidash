import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums';

/**
 * Typed response body for GET /v1/auth/me — mirrors the AuthUser shape
 * attached to the request by the JWT guard (id, email, name, role).
 */
export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'dispatcher@logidash.dev' }) email!: string;
  @ApiProperty({ example: 'Dispatch Lead' }) name!: string;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role!: Role;
}
