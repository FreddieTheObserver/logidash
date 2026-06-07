import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsPositive } from 'class-validator';
import { VehicleStatus, VehicleType } from '../../../generated/prisma/enums';

export class CreateVehicleDto {
  @ApiProperty({ enum: VehicleType }) @IsEnum(VehicleType) type!: VehicleType;
  @ApiProperty({ minimum: 0 }) @IsPositive() capacityWeight!: number;
  @ApiProperty({ minimum: 0 }) @IsPositive() capacityVolume!: number;

  @ApiPropertyOptional({ enum: VehicleStatus })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
