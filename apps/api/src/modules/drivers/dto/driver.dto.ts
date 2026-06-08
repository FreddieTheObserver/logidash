import { ApiProperty } from '@nestjs/swagger';
import { DriverAvailability } from '../../../generated/prisma/enums';

export class DriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: DriverAvailability }) availability!: DriverAvailability;
  @ApiProperty() baseZoneId!: string;
  @ApiProperty() activeJobCount!: number;
  @ApiProperty() maxConcurrentJobs!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
