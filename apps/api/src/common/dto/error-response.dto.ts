import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The body shape produced by AllExceptionsFilter for every non-2xx response.
 * Documented here so the generated client gets a typed error model.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'Conflict' }) error!: string;
  @ApiProperty({ example: 'Delivery is not in ready status' }) message!: string;
  @ApiPropertyOptional({
    type: [String],
    description: 'Per-field validation messages (400 responses only)',
    example: ['name should not be empty'],
  })
  details?: string[];
}
