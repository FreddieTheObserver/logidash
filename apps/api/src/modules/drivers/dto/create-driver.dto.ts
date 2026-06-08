import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateDriverDto {
  @ApiProperty() @IsString() @MinLength(1) userId!: string;
  @ApiProperty() @IsString() @MinLength(1) baseZoneId!: string;

  @ApiPropertyOptional({ enum: DriverAvailability })
  @IsOptional()
  @IsEnum(DriverAvailability)
  availability?: DriverAvailability;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConcurrentJobs?: number;
}
