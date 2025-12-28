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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { StoreService } from './service';
import { SyncService } from '../sync/service';
import { CreateStoreDto, CreateStoreSchema } from './dto.create';
import { UpdateStoreDto, UpdateStoreSchema, UpdateCredentialsDto, UpdateCredentialsSchema } from './dto.update';
import { QueryStoreDto, QueryStoreSchema } from './dto.query';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';
import { StoreMemberRole } from './enum';

@ApiTags('Store')
@ApiBearerAuth()
@Controller(':lang/store')
@UseGuards(AuthGuard('jwt'))
export class StoreController {
  constructor(
    private readonly storeService: StoreService,
    private readonly syncService: SyncService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Connect a new store' })
  @ApiResponse({ status: 201, description: 'Store connected successfully' })
  @ApiResponse({ status: 409, description: 'Store URL already exists' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateStoreSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async create(
    @Body() dto: CreateStoreDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all stores for current user' })
  @ApiResponse({ status: 200, description: 'Stores retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryStoreSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(
    @Query() query: QueryStoreDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.findByUser(user._id.toString(), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get store by ID' })
  @ApiResponse({ status: 200, description: 'Store retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
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
    return await this.storeService.findById(id, user._id.toString());
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update store settings' })
  @ApiResponse({ status: 200, description: 'Store updated successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateStoreSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.update(id, user._id.toString(), dto);
  }

  @Patch(':id/credentials')
  @ApiOperation({ summary: 'Update store API credentials' })
  @ApiResponse({ status: 200, description: 'Credentials updated successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateCredentialsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateCredentials(
    @Param('id') id: string,
    @Body() dto: UpdateCredentialsDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.updateCredentials(id, user._id.toString(), dto);
  }

  @Post(':id/test-connection')
  @ApiOperation({ summary: 'Test store WooCommerce connection' })
  @ApiResponse({ status: 200, description: 'Connection test completed' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async testConnection(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.testConnection(id, user._id.toString());
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Trigger store sync' })
  @ApiResponse({ status: 200, description: 'Sync triggered successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async triggerSync(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    // Verify user has access to this store
    await this.storeService.findById(id, user._id.toString());
    // Start full sync (products, orders, customers, reviews)
    return await this.syncService.startFullSync(id, user._id.toString());
  }

  @Get(':id/webhook-config')
  @ApiOperation({ summary: 'Get webhook configuration for store' })
  @ApiResponse({ status: 200, description: 'Webhook configuration retrieved' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getWebhookConfig(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.getWebhookConfig(id, user._id.toString());
  }

  @Post(':id/webhook-config/regenerate')
  @ApiOperation({ summary: 'Regenerate webhook secret for store' })
  @ApiResponse({ status: 200, description: 'Webhook secret regenerated' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async regenerateWebhookSecret(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.regenerateWebhookSecret(id, user._id.toString());
  }

  // ==================== MEMBER MANAGEMENT ====================

  @Get(':id/members')
  @ApiOperation({ summary: 'Get store members' })
  @ApiResponse({ status: 200, description: 'Members retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @ApiParam({ name: 'id', description: 'Store ID' })
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
    return await this.storeService.getMembers(id, user._id.toString());
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to the store' })
  @ApiResponse({ status: 200, description: 'Member added successfully' })
  @ApiResponse({ status: 400, description: 'Cannot add member with owner role' })
  @ApiResponse({ status: 403, description: 'Only owner and admin can add members' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'role'],
      properties: {
        userId: { type: 'string', description: 'User ID to add as member' },
        role: {
          type: 'string',
          enum: ['admin', 'manager', 'staff', 'viewer'],
          description: 'Role for the new member'
        },
      },
    },
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role: StoreMemberRole },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const result = await this.storeService.addMember(
      id,
      user._id.toString(),
      body.userId,
      body.role,
    );
    return {
      message: 'Member added successfully',
      store: result,
    };
  }

  @Patch(':id/members/:memberId/role')
  @ApiOperation({ summary: 'Update a member\'s role' })
  @ApiResponse({ status: 200, description: 'Member role updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot assign owner role' })
  @ApiResponse({ status: 403, description: 'Only store owner can change member roles' })
  @ApiResponse({ status: 404, description: 'Store or member not found' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiParam({ name: 'memberId', description: 'Member user ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['role'],
      properties: {
        role: {
          type: 'string',
          enum: ['admin', 'manager', 'staff', 'viewer'],
          description: 'New role for the member'
        },
      },
    },
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async updateMemberRole(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: { role: StoreMemberRole },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const result = await this.storeService.updateMemberRole(
      id,
      user._id.toString(),
      memberId,
      body.role,
    );
    return {
      message: 'Member role updated successfully',
      store: result,
    };
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from the store' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 400, description: 'Cannot remove store owner' })
  @ApiResponse({ status: 403, description: 'Only owner and admin can remove members' })
  @ApiResponse({ status: 404, description: 'Store or member not found' })
  @ApiParam({ name: 'id', description: 'Store ID' })
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
    const result = await this.storeService.removeMember(
      id,
      user._id.toString(),
      memberId,
    );
    return {
      message: 'Member removed successfully',
      store: result,
    };
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave a store (for non-owner members)' })
  @ApiResponse({ status: 200, description: 'Left store successfully' })
  @ApiResponse({ status: 400, description: 'Owner cannot leave the store' })
  @ApiResponse({ status: 404, description: 'Store not found or not a member' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async leaveStore(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.storeService.leaveStore(id, user._id.toString());
    return { message: 'Left store successfully' };
  }

  @Post(':id/transfer-ownership')
  @ApiOperation({ summary: 'Transfer store ownership to another user' })
  @ApiResponse({ status: 200, description: 'Ownership transferred successfully' })
  @ApiResponse({ status: 400, description: 'Cannot transfer ownership to yourself' })
  @ApiResponse({ status: 403, description: 'Only store owner can transfer ownership' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['newOwnerId'],
      properties: {
        newOwnerId: { type: 'string', description: 'User ID of the new owner' },
      },
    },
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async transferOwnership(
    @Param('id') id: string,
    @Body() body: { newOwnerId: string },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const result = await this.storeService.transferOwnership(
      id,
      user._id.toString(),
      body.newOwnerId,
    );
    return {
      message: 'Ownership transferred successfully. You are now an admin.',
      store: result,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect store' })
  @ApiResponse({ status: 200, description: 'Store disconnected successfully' })
  @ApiResponse({ status: 403, description: 'Only store owner can delete the store' })
  @ApiResponse({ status: 404, description: 'Store not found' })
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
    await this.storeService.delete(id, user._id.toString());
    return { message: 'Store disconnected successfully' };
  }
}
