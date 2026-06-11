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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
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
@ApiErrorResponses(401)
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  @ApiCreatedResponse({ type: DriverDto })
  @ApiErrorResponses(400, 403, 404, 409)
  create(@Body() dto: CreateDriverDto): Promise<DriverDto> {
    return this.drivers.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(DriverDto)
  @ApiErrorResponses(400)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DriverDto>> {
    return this.drivers.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: DriverDto })
  @ApiErrorResponses(404)
  getById(@Param('id') id: string): Promise<DriverDto> {
    return this.drivers.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  @ApiOkResponse({ type: DriverDto })
  @ApiErrorResponses(400, 403, 404)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.update(id, dto);
  }

  @Put(':id/vehicle')
  @Roles(Role.admin, Role.dispatcher)
  @ApiOkResponse({ type: DriverDto })
  @ApiErrorResponses(400, 403, 404, 409)
  setVehicle(
    @Param('id') id: string,
    @Body() dto: SetVehicleDto,
  ): Promise<DriverDto> {
    return this.drivers.setVehicle(id, dto.vehicleId);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiErrorResponses(403, 404, 409)
  remove(@Param('id') id: string): Promise<void> {
    return this.drivers.remove(id);
  }
}
