import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryStatus,
  PackageSize,
  Priority,
} from '../../../generated/prisma/enums';

export class DeliveryDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty() pickupAddress!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupLat!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupLng!:
    | number
    | null;
  @ApiProperty() dropoffAddress!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) dropoffLat!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) dropoffLng!:
    | number
    | null;
  @ApiProperty() zoneId!: string;
  @ApiProperty({ enum: PackageSize }) packageSize!: PackageSize;
  @ApiProperty() packageWeight!: number;
  @ApiProperty() packageType!: string;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty() deadlineAt!: Date;
  @ApiProperty({ enum: DeliveryStatus }) status!: DeliveryStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) cancellationReason!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
