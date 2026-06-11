import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'DriverProfile id to assign' })
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @ApiPropertyOptional({ description: 'Recorded in the audit trail' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
