import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../generated/prisma/enums';
import { AssignmentDto } from './dto/assignment.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { AssignmentsService } from './assignments.service';

@ApiTags('assignments')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('deliveries/:deliveryId/assignments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.admin, Role.dispatcher)
  @ApiCreatedResponse({ type: AssignmentDto })
  @ApiErrorResponses(400, 403, 404, 409)
  create(
    @Param('deliveryId') deliveryId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssignmentDto> {
    return this.assignments.create(deliveryId, dto, user);
  }

  @Get('deliveries/:deliveryId/assignments')
  @ApiPaginatedResponse(AssignmentDto)
  @ApiErrorResponses(400, 404)
  listByDelivery(
    @Param('deliveryId') deliveryId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    return this.assignments.listByDelivery(deliveryId, query);
  }

  @Get('drivers/:driverId/assignments')
  @ApiPaginatedResponse(AssignmentDto)
  @ApiErrorResponses(400, 404)
  listByDriver(
    @Param('driverId') driverId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    return this.assignments.listByDriver(driverId, query);
  }
}
