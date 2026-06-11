import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MapsModule } from '../maps/maps.module';
import { DEFAULT_WEIGHTS, RECOMMENDATION_WEIGHTS } from './engine/weights';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AuditModule, MapsModule],
  controllers: [RecommendationsController],
  providers: [
    { provide: RECOMMENDATION_WEIGHTS, useValue: DEFAULT_WEIGHTS },
    RecommendationsService,
  ],
})
export class RecommendationsModule {}
