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
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneDto } from './dto/zone.dto';
import { ZonesService } from './zones.service';

@ApiTags('zones')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  @ApiCreatedResponse({ type: ZoneDto })
  @ApiErrorResponses(400, 403)
  create(@Body() dto: CreateZoneDto): Promise<ZoneDto> {
    return this.zones.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(ZoneDto)
  @ApiErrorResponses(400)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<ZoneDto>> {
    return this.zones.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ZoneDto })
  @ApiErrorResponses(404)
  getById(@Param('id') id: string): Promise<ZoneDto> {
    return this.zones.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  @ApiOkResponse({ type: ZoneDto })
  @ApiErrorResponses(400, 403, 404)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
  ): Promise<ZoneDto> {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiErrorResponses(403, 404, 409)
  remove(@Param('id') id: string): Promise<void> {
    return this.zones.remove(id);
  }
}
