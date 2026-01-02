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
import { ProductStockService } from './service';
import {
  CreateProductStockDto,
  CreateProductStockSchema,
  UpdateProductStockDto,
  UpdateProductStockSchema,
  QueryProductStockDto,
  QueryProductStockSchema,
  QueryTransactionsDto,
  QueryTransactionsSchema,
} from './dto';

@ApiTags('Product Stock')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/product-stock')
export class ProductStockController {
  constructor(private readonly stockService: ProductStockService) {}

  // ========================
  // CRUD Operations
  // ========================

  // Static routes MUST come before parameterized routes (:id)

  @Get()
  @ApiOperation({ summary: 'List product stock with filters' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryProductStockSchema }))
  async findAll(@User('_id') userId: string, @Query() query: QueryProductStockDto) {
    return this.stockService.findByStore(userId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get stock summary for dashboard' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async getSummary(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.stockService.getSummary(userId, storeId);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get low stock items' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async getLowStock(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.stockService.getLowStock(userId, storeId);
  }

  @Get('locations')
  @ApiOperation({ summary: 'Get unique stock locations' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async getLocations(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.stockService.getLocations(userId, storeId);
  }

  @Get('by-sku/:sku')
  @ApiOperation({ summary: 'Get stock by SKU' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'sku', description: 'Product SKU' })
  @ApiQuery({ name: 'storeId', required: true })
  async findBySku(
    @User('_id') userId: string,
    @Param('sku') sku: string,
    @Query('storeId') storeId: string,
  ) {
    return this.stockService.findBySku(userId, storeId, sku);
  }

  @Get('audit/check')
  @ApiOperation({ summary: 'Audit stock to find mismatches between ProductStock and ProductUnits' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async auditStock(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.stockService.auditStock(userId, storeId);
  }

  @Post('audit/reconcile')
  @ApiOperation({ summary: 'Reconcile stock mismatches - updates ProductStock to match ProductUnit counts' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async reconcileStock(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.stockService.reconcileStock(userId, storeId);
  }

  // Parameterized routes MUST come after static routes

  @Get(':id')
  @ApiOperation({ summary: 'Get stock by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Stock entry ID' })
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.stockService.findById(userId, id);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get transaction history for a stock entry' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Stock entry ID' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryTransactionsSchema }))
  async getTransactions(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Query() query: QueryTransactionsDto,
  ) {
    return this.stockService.getTransactions(userId, id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create product stock entry' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: CreateProductStockSchema }))
  async create(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateProductStockDto,
  ) {
    return this.stockService.create(storeId, userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update stock settings' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Stock entry ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateProductStockSchema }))
  async update(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductStockDto,
  ) {
    return this.stockService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete stock entry (must have zero stock)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Stock entry ID' })
  async delete(@User('_id') userId: string, @Param('id') id: string) {
    await this.stockService.delete(userId, id);
    return { message: 'Stock entry deleted successfully' };
  }

  // NOTE: Manual stock operations (add/deduct/adjust/reserve) have been removed.
  // Stock is now automatically managed through:
  // 1. Production Batches → creates Product Units → adds to stock
  // 2. Product Unit status changes (sold/damaged/hold) → syncs to stock
  // Use audit/check and audit/reconcile endpoints to verify and fix any mismatches.
}
