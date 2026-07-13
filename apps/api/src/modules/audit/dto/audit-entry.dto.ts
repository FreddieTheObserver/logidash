import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums';

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty() actorUserId!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({ enum: Role }) actorRole!: Role;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  before?: Record<string, unknown>;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  after?: Record<string, unknown>;
  @ApiPropertyOptional({ type: String, nullable: true }) reason?: string;
  @ApiProperty() createdAt!: Date;
}
