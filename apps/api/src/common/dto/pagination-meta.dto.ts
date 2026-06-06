import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page(1-based)' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;

  @ApiProperty({ description: 'Total items across all pages' })
  total!: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages!: number;
}
