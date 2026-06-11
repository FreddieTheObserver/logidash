import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RecommendationQueryDto {
  @ApiPropertyOptional({
    description:
      'Force a fresh run (admin/dispatcher only; delivery must be ready)',
    default: false,
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  refresh: boolean = false;
}
