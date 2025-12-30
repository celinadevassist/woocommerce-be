import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JoiValidationPipe } from '../pipes';
import { User } from '../decorators';
import { FixedAssetsService } from './service';
import {
  CreateFixedAssetDto,
  CreateFixedAssetSchema,
  UpdateFixedAssetDto,
  UpdateFixedAssetSchema,
  CreateMaintenanceLogDto,
  CreateMaintenanceLogSchema,
  QueryFixedAssetDto,
  QueryFixedAssetSchema,
} from './dto';

@ApiTags('Fixed Assets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/fixed-assets')
export class FixedAssetsController {
  constructor(private readonly assetsService: FixedAssetsService) {}

  // ========================
  // CRUD Operations
  // ========================

  @Get()
  @ApiOperation({ summary: 'Get all fixed assets' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'maintenanceDue', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryFixedAssetSchema }))
  async findAll(@User('_id') userId: string, @Query() query: QueryFixedAssetDto) {
    return this.assetsService.findAll(userId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get asset summary for dashboard' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async getSummary(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.assetsService.getSummary(userId, storeId);
  }

  @Get('maintenance-due')
  @ApiOperation({ summary: 'Get assets with overdue maintenance' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async getMaintenanceDue(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.assetsService.getMaintenanceDue(userId, storeId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get available asset categories' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  async getCategories() {
    return this.assetsService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.assetsService.findById(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new fixed asset' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: CreateFixedAssetSchema }))
  async create(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateFixedAssetDto,
  ) {
    return this.assetsService.create(storeId, userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a fixed asset' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateFixedAssetSchema }))
  async update(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    return this.assetsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a fixed asset' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async delete(@User('_id') userId: string, @Param('id') id: string) {
    await this.assetsService.delete(userId, id);
    return { message: 'Asset deleted successfully' };
  }

  // ========================
  // Maintenance
  // ========================

  @Post(':id/maintenance')
  @ApiOperation({ summary: 'Log maintenance for an asset' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @UsePipes(new JoiValidationPipe({ body: CreateMaintenanceLogSchema }))
  async addMaintenanceLog(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateMaintenanceLogDto,
  ) {
    return this.assetsService.addMaintenanceLog(userId, id, dto);
  }

  @Delete(':id/maintenance/:logId')
  @ApiOperation({ summary: 'Delete a maintenance log' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'logId', description: 'Maintenance Log ID' })
  async deleteMaintenanceLog(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Param('logId') logId: string,
  ) {
    return this.assetsService.deleteMaintenanceLog(userId, id, logId);
  }
}
