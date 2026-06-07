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
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneDto } from './dto/zone.dto';
import { ZonesService } from './zones.service';

@ApiTags('zones')
@ApiBearerAuth()
@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateZoneDto): Promise<ZoneDto> {
    return this.zones.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(ZoneDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<ZoneDto>> {
    return this.zones.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ZoneDto> {
    return this.zones.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
  ): Promise<ZoneDto> {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.zones.remove(id);
  }
}
