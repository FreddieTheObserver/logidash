import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { RecommendationRunDto } from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('deliveries/:deliveryId/recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @ApiOkResponse({ type: RecommendationRunDto })
  @ApiErrorResponses(403, 404, 409)
  getForDelivery(
    @Param('deliveryId') deliveryId: string,
    @Query() query: RecommendationQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RecommendationRunDto> {
    return this.recommendations.getForDelivery(deliveryId, query, user);
  }
}
