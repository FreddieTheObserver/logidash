import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

export class HealthStatusDto {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: '2026-06-11T12:00:00.000Z' }) timestamp!: string;
}

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthStatusDto })
  check(): HealthStatusDto {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
