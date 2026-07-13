import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { AuditService } from './audit.service';
import { AuditEntryDto } from './dto/audit-entry.dto';

@ApiTags('audit')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiPaginatedResponse(AuditEntryDto)
  @ApiErrorResponses(400)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<AuditEntryDto>> {
    return this.audit.listRecent(query);
  }
}
