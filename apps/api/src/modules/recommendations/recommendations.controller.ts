import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { RecommendationRunDto } from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller('deliveries/:deliveryId/recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @ApiOkResponse({ type: RecommendationRunDto })
  getForDelivery(
    @Param('deliveryId') deliveryId: string,
    @Query() query: RecommendationQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RecommendationRunDto> {
    return this.recommendations.getForDelivery(deliveryId, query, user);
  }
}
