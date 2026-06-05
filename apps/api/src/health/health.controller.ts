import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
