import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
}

function makeHost(captured: CapturedResponse): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps Prisma P2025 (record not found) to a 404', () => {
    const captured: CapturedResponse = {};
    filter.catch({ code: 'P2025', clientVersion: '7.8.0' }, makeHost(captured));
    expect(captured.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toMatchObject({ statusCode: 404, error: 'NotFound' });
  });

  it('maps Prisma P2002 (unique constraint) to a 409', () => {
    const captured: CapturedResponse = {};
    filter.catch({ code: 'P2002', clientVersion: '7.8.0' }, makeHost(captured));
    expect(captured.statusCode).toBe(HttpStatus.CONFLICT);
    expect(captured.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
  });

  it('falls back to 500 for an unknown error', () => {
    const captured: CapturedResponse = {};
    filter.catch(new Error('boom'), makeHost(captured));
    expect(captured.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toMatchObject({ statusCode: 500 });
  });

  it('preserves HttpException status and name', () => {
    const captured: CapturedResponse = {};
    filter.catch(new NotFoundException('Zone not found'), makeHost(captured));
    expect(captured.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toMatchObject({
      statusCode: 404,
      message: 'Zone not found',
    });
  });
});
