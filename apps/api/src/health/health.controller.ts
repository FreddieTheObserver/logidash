import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
