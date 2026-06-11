import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@ApiErrorResponses(401, 403)
@Roles(Role.admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiCreatedResponse({ type: UserDto })
  @ApiErrorResponses(400, 409)
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: UserDto, isArray: true })
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  @ApiErrorResponses(404)
  getById(@Param('id') id: string): Promise<UserDto> {
    return this.users.getById(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserDto })
  @ApiErrorResponses(400, 404, 409)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.update(id, dto);
  }
}
