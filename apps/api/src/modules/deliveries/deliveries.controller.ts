import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { Paginated } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../generated/prisma/enums';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryDto } from './dto/delivery.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateDeliveryDto): Promise<DeliveryDto> {
    return this.deliveries.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(DeliveryDto)
  list(@Query() query: DeliveryQueryDto): Promise<Paginated<DeliveryDto>> {
    return this.deliveries.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DeliveryDto> {
    return this.deliveries.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
  ): Promise<DeliveryDto> {
    return this.deliveries.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.admin, Role.dispatcher, Role.driver)
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DeliveryDto> {
    return this.deliveries.changeStatus(id, dto, user);
  }
}
