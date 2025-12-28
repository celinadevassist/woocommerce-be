import { Controller, Get, UsePipes, UseGuards, Query, Param, Body, Post, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { RoleService } from '../services';

import { Scopes, User } from '../decorators';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../guards';
import { JoiValidationPipe } from '../pipes';
import {  IRole, IPagination } from '../interfaces';
import {
  CreateRoleDTO, CreateRoleSchema,
  UpdateRoleDTO, UpdateRoleSchema,
  QueryRoleDTO, QueryRoleSchema,
  MongoIdSchema,
  LanguageSchema,
} from '../dtos';
import { UserDocument } from 'src/schema';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller(':lang/role')

export class RoleController {
  constructor(
    private readonly roleService: RoleService,
  ) { }
  // create
  @Post()
  @UsePipes(new JoiValidationPipe({
    body: CreateRoleSchema,
    param:{
      lang: LanguageSchema,
    },
  }))
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('role:create')
  async add(@Body() newRole: CreateRoleDTO, @User() creator: UserDocument, @Param('lang') lang: string): Promise<IRole> {
    return await this.roleService.create(newRole, creator, lang);
  }
  // update
  @Patch(':id')
  @UsePipes(new JoiValidationPipe({
    body: UpdateRoleSchema,
    param: {
      id: MongoIdSchema,
      lang: LanguageSchema,
    },
  }))
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('role:update')
  async update(@Body() role: UpdateRoleDTO, @Param('id') id: string, @User() creator: UserDocument, @Param('lang') lang: string): Promise<IRole> {
    return await this.roleService.update(id, role, creator, lang);
  }
  // get many
  @Get()
  @UseGuards(AuthGuard(), RolesGuard)
  @UsePipes(new JoiValidationPipe({
    query: QueryRoleSchema,
    param:{
      lang: LanguageSchema,
    },
  }))
  @Scopes('role:read-many')
  async query(@Query() filters: QueryRoleDTO, @Param('lang') lang: string): Promise<{ pagination: IPagination, records: IRole[] }> {
    return await this.roleService.get(filters, lang);
  }
  // get one
  @Get(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @UsePipes(new JoiValidationPipe({
    param: {
      id: MongoIdSchema,
      lang: LanguageSchema,
    },
  }))
  @Scopes('role:read')
  async findById(@Param('id') id: string, @Param('lang') lang: string): Promise<IRole> {
    return await this.roleService.getById(id, lang);
  }
  // remove
  @Delete(':id')
  @UsePipes(new JoiValidationPipe({
    param: {
      id: MongoIdSchema,
      lang: LanguageSchema,
    },
  }))
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('role:delete')
  async removeById(@Param('id') id: string, @Param('lang') lang: string): Promise<{ message: string, deletedCount: number }> {
    return await this.roleService.remove(id, lang);
  }
}
