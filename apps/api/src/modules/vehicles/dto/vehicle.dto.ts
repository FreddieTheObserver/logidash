import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleStatus, VehicleType } from '../../../generated/prisma/enums';

export class VehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VehicleType }) type!: VehicleType;
  @ApiProperty() capacityWeight!: number;
  @ApiProperty() capacityVolume!: number;
  @ApiProperty({ enum: VehicleStatus }) status!: VehicleStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) driverId!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
