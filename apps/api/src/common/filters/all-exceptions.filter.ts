import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

/** Shape of a Prisma known-request error (e.g. P2025, P2002) without importing the class. */
interface PrismaKnownError {
  code: string;
  clientVersion: string;
}

function isPrismaKnownError(exception: unknown): exception is PrismaKnownError {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    typeof exception.code === 'string' &&
    'clientVersion' in exception
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.buildBody(exception);

    // Log unexpected server-side failures (5xx); never sent to the client.
    if (body.statusCode >= 500) {
      this.logger.error(exception);
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return { statusCode: status, error: exception.name, message: res };
      }

      const obj = res as { message?: unknown; error?: unknown };
      const isFieldErrors = Array.isArray(obj.message);

      return {
        statusCode: status,
        error: typeof obj.error === 'string' ? obj.error : exception.name,
        message: isFieldErrors
          ? 'Validation failed'
          : typeof obj.message === 'string'
            ? obj.message
            : exception.message,
        details: isFieldErrors ? obj.message : undefined,
      };
    }

    // Map common Prisma errors that slip past service-level guards (e.g. races)
    // to meaningful HTTP statuses instead of an opaque 500.
    if (isPrismaKnownError(exception)) {
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NotFound',
          message: 'Resource not found',
        };
      }
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'Resource already exists',
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Internal Server Error',
    };
  }
}
