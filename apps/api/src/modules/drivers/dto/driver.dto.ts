import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DriverAvailability,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';

export class DriverVehicleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VehicleType }) type!: VehicleType;
  @ApiProperty({ enum: VehicleStatus }) status!: VehicleStatus;
  @ApiProperty() capacityWeight!: number;
  @ApiProperty() capacityVolume!: number;
}

export class DriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: DriverAvailability }) availability!: DriverAvailability;
  @ApiProperty() baseZoneId!: string;
  @ApiProperty() activeJobCount!: number;
  @ApiProperty() maxConcurrentJobs!: number;
  @ApiPropertyOptional({ type: DriverVehicleSummaryDto, nullable: true })
  vehicle!: DriverVehicleSummaryDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
