import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { PackageSize, Priority } from '../../../generated/prisma/enums';

export class CreateDeliveryDto {
  @ApiProperty() @IsString() @MinLength(1) reference!: string;
  @ApiProperty() @IsString() @MinLength(1) pickupAddress!: string;
  @ApiProperty() @IsString() @MinLength(1) dropoffAddress!: string;
  @ApiProperty() @IsString() @MinLength(1) zoneId!: string;
  @ApiProperty({ enum: PackageSize })
  @IsEnum(PackageSize)
  packageSize!: PackageSize;
  @ApiProperty({ minimum: 0 }) @IsPositive() packageWeight!: number;
  @ApiProperty() @IsString() @MinLength(1) packageType!: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({ description: 'ISO 8601 datetime' })
  @IsDateString()
  deadlineAt!: string;
}
