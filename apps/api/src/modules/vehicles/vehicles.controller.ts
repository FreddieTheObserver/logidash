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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleDto } from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  @ApiCreatedResponse({ type: VehicleDto })
  @ApiErrorResponses(400, 403)
  create(@Body() dto: CreateVehicleDto): Promise<VehicleDto> {
    return this.vehicles.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(VehicleDto)
  @ApiErrorResponses(400)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<VehicleDto>> {
    return this.vehicles.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: VehicleDto })
  @ApiErrorResponses(404)
  getById(@Param('id') id: string): Promise<VehicleDto> {
    return this.vehicles.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  @ApiOkResponse({ type: VehicleDto })
  @ApiErrorResponses(400, 403, 404)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleDto> {
    return this.vehicles.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiErrorResponses(403, 404, 409)
  remove(@Param('id') id: string): Promise<void> {
    return this.vehicles.remove(id);
  }
}
