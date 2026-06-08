import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetVehicleDto {
  // null clears the driver's current vehicle link.
  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleId!: string | null;
}
