import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DeliveryStatus } from '../../../generated/prisma/enums';

export class ChangeStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @ApiPropertyOptional({
    description: 'Required-ish for cancelled/failed; audited',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
