import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MapsModule } from '../maps/maps.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [AuditModule, MapsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
