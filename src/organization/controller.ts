import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { OrganizationService } from './service';
import { CreateOrganizationDto, CreateOrganizationSchema } from './dto.create';
import { UpdateOrganizationDto, UpdateOrganizationSchema } from './dto.update';
import { QueryOrganizationDto, QueryOrganizationSchema } from './dto.query';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';
import { OrganizationMemberRole } from './enum';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller(':lang/organization')
@UseGuards(AuthGuard('jwt'))
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateOrganizationSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async create(
    @Body() dto: CreateOrganizationDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all organizations for current user' })
  @ApiResponse({ status: 200, description: 'Organizations retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryOrganizationSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(
    @Query() query: QueryOrganizationDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.findByUser(user._id.toString(), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiResponse({ status: 200, description: 'Organization retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async findOne(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.findById(id, user._id.toString());
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateOrganizationSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.update(id, user._id.toString(), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete organization' })
  @ApiResponse({ status: 200, description: 'Organization deleted successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async delete(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.organizationService.delete(id, user._id.toString());
    return { message: 'Organization deleted successfully' };
  }

  // ==================== MEMBER MANAGEMENT ====================

  @Get(':id/members')
  @ApiOperation({ summary: 'Get all members of an organization' })
  @ApiResponse({ status: 200, description: 'Members retrieved successfully' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getMembers(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.getMembers(id, user._id.toString());
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Invite a new member to the organization' })
  @ApiResponse({ status: 201, description: 'Member invited successfully' })
  @ApiResponse({ status: 400, description: 'Member limit reached or invalid role' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'role'],
      properties: {
        userId: { type: 'string', description: 'User ID to invite' },
        role: { type: 'string', enum: ['admin', 'manager', 'staff', 'viewer'] },
        storeAccess: {
          oneOf: [
            { type: 'string', enum: ['all'] },
            { type: 'array', items: { type: 'string' } }
          ]
        },
      },
    },
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async inviteMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role: OrganizationMemberRole; storeAccess?: string[] | 'all' },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.inviteMember(
      id,
      user._id.toString(),
      body.userId,
      body.role,
      body.storeAccess || 'all',
    );
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({ summary: 'Update a member\'s role or store access' })
  @ApiResponse({ status: 200, description: 'Member updated successfully' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiParam({ name: 'memberId', description: 'Member user ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['admin', 'manager', 'staff', 'viewer'] },
        storeAccess: {
          oneOf: [
            { type: 'string', enum: ['all'] },
            { type: 'array', items: { type: 'string' } }
          ]
        },
      },
    },
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: { role?: OrganizationMemberRole; storeAccess?: string[] | 'all' },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.updateMember(
      id,
      user._id.toString(),
      memberId,
      body,
    );
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from the organization' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  @ApiResponse({ status: 400, description: 'Cannot remove owner' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiParam({ name: 'memberId', description: 'Member user ID' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.removeMember(
      id,
      user._id.toString(),
      memberId,
    );
  }

  @Post(':id/accept-invitation')
  @ApiOperation({ summary: 'Accept a pending invitation to an organization' })
  @ApiResponse({ status: 200, description: 'Invitation accepted successfully' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async acceptInvitation(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.organizationService.acceptInvitation(id, user._id.toString());
  }
}
