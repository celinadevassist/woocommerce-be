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
  @ApiResponse({ status: 400, description: 'Store limit reached' })
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

  @Get(':id/transfer-targets')
  @ApiOperation({ summary: 'Get organizations the store can be transferred to' })
  @ApiResponse({ status: 200, description: 'Transfer targets retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @ApiResponse({ status: 403, description: 'Only organization owners and admins can transfer stores' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getTransferTargets(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.storeService.getTransferTargetOrganizations(id, user._id.toString());
  }

  @Post(':id/transfer')
  @ApiOperation({ summary: 'Transfer store to another organization' })
  @ApiResponse({ status: 200, description: 'Store transferred successfully' })
  @ApiResponse({ status: 400, description: 'Cannot transfer to the same organization' })
  @ApiResponse({ status: 403, description: 'Only organization owners and admins can transfer stores' })
  @ApiResponse({ status: 404, description: 'Store or target organization not found' })
  @ApiResponse({ status: 409, description: 'Store with this URL already exists in target organization' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['targetOrganizationId'],
      properties: {
        targetOrganizationId: { type: 'string', description: 'ID of the organization to transfer the store to' },
      },
    },
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async transferStore(
    @Param('id') id: string,
    @Body() body: { targetOrganizationId: string },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const result = await this.storeService.transferStore(
      id,
      user._id.toString(),
      body.targetOrganizationId,
    );
    return {
      message: 'Store transferred successfully',
      store: result,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect store' })
  @ApiResponse({ status: 200, description: 'Store disconnected successfully' })
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
