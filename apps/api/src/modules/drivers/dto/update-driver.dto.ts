import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DriverAvailability } from '../../../generated/prisma/enums';

export class UpdateDriverDto {
  @ApiPropertyOptional({ enum: DriverAvailability })
  @IsOptional()
  @IsEnum(DriverAvailability)
  availability?: DriverAvailability;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  baseZoneId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConcurrentJobs?: number;
}
