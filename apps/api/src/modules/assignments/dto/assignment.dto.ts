import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus } from '../../../generated/prisma/enums';

export class AssignmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() deliveryId!: string;
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
