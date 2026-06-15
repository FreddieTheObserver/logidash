import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { Paginated } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../generated/prisma/enums';
import { AuditEntryDto } from '../audit/dto/audit-entry.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryDto } from './dto/delivery.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { RouteEstimateDto } from './dto/route-estimate.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  @ApiCreatedResponse({ type: DeliveryDto })
  @ApiErrorResponses(400, 403, 404)
  create(
    @Body() dto: CreateDeliveryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DeliveryDto> {
    return this.deliveries.create(dto, user);
  }

  @Get()
  @ApiPaginatedResponse(DeliveryDto)
  @ApiErrorResponses(400)
  list(@Query() query: DeliveryQueryDto): Promise<Paginated<DeliveryDto>> {
    return this.deliveries.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: DeliveryDto })
  @ApiErrorResponses(404)
  getById(@Param('id') id: string): Promise<DeliveryDto> {
    return this.deliveries.getById(id);
  }

  @Get(':id/audit')
  @ApiPaginatedResponse(AuditEntryDto)
  @ApiErrorResponses(404)
  getAudit(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AuditEntryDto>> {
    return this.deliveries.listAudit(id, query);
  }

  @Get(':id/route-estimate')
  @ApiOkResponse({ type: RouteEstimateDto })
  @ApiErrorResponses(404)
  getRouteEstimate(@Param('id') id: string): Promise<RouteEstimateDto> {
    return this.deliveries.getRouteEstimate(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  @ApiOkResponse({ type: DeliveryDto })
  @ApiErrorResponses(400, 403, 404)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
  ): Promise<DeliveryDto> {
    return this.deliveries.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.admin, Role.dispatcher, Role.driver)
  @ApiOkResponse({ type: DeliveryDto })
  @ApiErrorResponses(400, 403, 404, 409)
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DeliveryDto> {
    return this.deliveries.changeStatus(id, dto, user);
  }
}
