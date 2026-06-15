import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RouteEstimateDto {
  @ApiProperty({
    description: 'False when coordinates are missing or the provider is down',
  })
  available!: boolean;

  @ApiProperty({
    description: 'True when the estimate is unavailable/degraded',
  })
  degraded!: boolean;

  @ApiPropertyOptional({ type: Number }) distanceMeters?: number;
  @ApiPropertyOptional({ type: Number }) durationSeconds?: number;
  @ApiPropertyOptional({ description: 'Maps provider name (e.g. ors, mock)' })
  provider?: string;
  @ApiPropertyOptional({
    description: 'Whether the estimate was served from cache',
  })
  cached?: boolean;
}
