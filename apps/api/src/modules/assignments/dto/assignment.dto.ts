import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssignmentStatus,
  DeliveryStatus,
} from '../../../generated/prisma/enums';

export class AssignmentDeliverySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: DeliveryStatus }) status!: DeliveryStatus;
}

export class AssignmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() deliveryId!: string;
  @ApiProperty({ type: AssignmentDeliverySummaryDto })
  delivery!: AssignmentDeliverySummaryDto;
  @ApiProperty() driverId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ enum: AssignmentStatus }) status!: AssignmentStatus;
  @ApiProperty() assignedByUserId!: string;
  @ApiProperty() assignedAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true })
  unassignedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unassignReason!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
