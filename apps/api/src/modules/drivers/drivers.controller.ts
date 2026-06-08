import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverDto } from './dto/driver.dto';
import { SetVehicleDto } from './dto/set-vehicle.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

@ApiTags('drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateDriverDto): Promise<DriverDto> {
    return this.drivers.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(DriverDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DriverDto>> {
    return this.drivers.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DriverDto> {
    return this.drivers.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.update(id, dto);
  }

  @Put(':id/vehicle')
  @Roles(Role.admin, Role.dispatcher)
  setVehicle(
    @Param('id') id: string,
    @Body() dto: SetVehicleDto,
  ): Promise<DriverDto> {
    return this.drivers.setVehicle(id, dto.vehicleId);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.drivers.remove(id);
  }
}
