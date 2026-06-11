import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

type ErrorStatus = 400 | 401 | 403 | 404 | 409;

const DESCRIPTIONS: Record<ErrorStatus, string> = {
  400: 'Validation failed — details lists per-field messages',
  401: 'Missing, expired, or invalid credentials/token',
  403: 'Authenticated but not allowed to perform this action',
  404: 'Resource not found',
  409: 'Business-rule conflict (illegal transition, referenced resource, duplicate, lost race)',
};

/** Documents standard error responses (all share the ErrorResponseDto shape). */
export function ApiErrorResponses(
  ...statuses: ErrorStatus[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        type: ErrorResponseDto,
        description: DESCRIPTIONS[status],
      }),
    ),
  );
}
