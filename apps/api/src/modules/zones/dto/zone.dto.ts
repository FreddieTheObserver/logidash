import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ZoneDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) centerLat!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) centerLng!:
    | number
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
