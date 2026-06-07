import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleDto } from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateVehicleDto): Promise<VehicleDto> {
    return this.vehicles.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(VehicleDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<VehicleDto>> {
    return this.vehicles.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<VehicleDto> {
    return this.vehicles.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleDto> {
    return this.vehicles.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.vehicles.remove(id);
  }
}
