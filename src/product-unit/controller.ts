import {
  Controller,
  Get,
  Post,
  Patch,
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
import { ProductUnitService } from './service';
import {
  QueryProductUnitDto,
  QueryProductUnitSchema,
  UpdateUnitStatusDto,
  UpdateUnitStatusSchema,
  BulkLookupDto,
  BulkLookupSchema,
  GenerateRfidDto,
  GenerateRfidSchema,
  MarkUnitsSoldDto,
  MarkUnitsSoldSchema,
  HoldUnitsDto,
  HoldUnitsSchema,
  UnholdUnitsDto,
  UnholdUnitsSchema,
  MarkDamagedDto,
  MarkDamagedSchema,
} from './dto';

@ApiTags('Product Units')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/product-units')
export class ProductUnitController {
  constructor(private readonly unitService: ProductUnitService) {}

  // ========================
  // List and Query Operations
  // ========================

  @Get()
  @ApiOperation({ summary: 'List product units with filters' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'skuId', required: false })
  @ApiQuery({ name: 'sku', required: false })
  @ApiQuery({ name: 'batchId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'orderId', required: false })
  @ApiQuery({ name: 'rfidCode', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryProductUnitSchema }))
  async findAll(@User('_id') userId: string, @Query() query: QueryProductUnitDto) {
    return this.unitService.findAll(query.storeId, userId, query);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get available units for a SKU (FIFO order)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'skuId', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAvailable(
    @Query('storeId') storeId: string,
    @Query('skuId') skuId: string,
    @Query('limit') limit?: number,
  ) {
    return this.unitService.getAvailableUnits(storeId, skuId, limit);
  }

  @Get('rfid/:code')
  @ApiOperation({ summary: 'Find unit by RFID code' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'code', description: 'RFID code' })
  @ApiQuery({ name: 'storeId', required: true })
  async findByRfid(@Param('code') code: string, @Query('storeId') storeId: string) {
    return this.unitService.findByRfidCode(storeId, code);
  }

  @Post('bulk-lookup')
  @ApiOperation({ summary: 'Bulk lookup units by RFID codes' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: BulkLookupSchema }))
  async bulkLookup(@Body() dto: BulkLookupDto) {
    return this.unitService.findByRfidCodes(dto.storeId, dto.rfidCodes);
  }

  @Get('batch/:batchId')
  @ApiOperation({ summary: 'Get units by production batch' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'batchId', description: 'Production batch ID' })
  async getByBatch(@Param('batchId') batchId: string) {
    return this.unitService.getUnitsByBatch(batchId);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get units by order' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async getByOrder(@Param('orderId') orderId: string) {
    return this.unitService.getUnitsByOrder(orderId);
  }

  @Get('counts/:skuId')
  @ApiOperation({ summary: 'Get unit counts by status for a SKU' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'skuId', description: 'SKU ID' })
  @ApiQuery({ name: 'storeId', required: true })
  async getCounts(@Param('skuId') skuId: string, @Query('storeId') storeId: string) {
    return this.unitService.getUnitCountsByStatus(storeId, skuId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get unit by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Unit ID' })
  async findById(@Param('id') id: string) {
    return this.unitService.findById(id);
  }

  // ========================
  // RFID Generation
  // ========================

  @Post('generate-rfid')
  @ApiOperation({ summary: 'Generate RFID codes (for preview before batch completion)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: GenerateRfidSchema }))
  async generateRfid(@Body() dto: GenerateRfidDto) {
    return this.unitService.generateBulkRfidCodes(dto.storeId, dto.skuCode, dto.count);
  }

  // ========================
  // Status Updates
  // ========================

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update unit status' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Unit ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateUnitStatusSchema }))
  async updateStatus(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUnitStatusDto,
  ) {
    return this.unitService.updateUnitStatus(userId, id, dto);
  }

  // ========================
  // Order Operations
  // ========================

  @Post('mark-sold')
  @ApiOperation({ summary: 'Mark units as sold (internal use by order system)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: MarkUnitsSoldSchema }))
  async markAsSold(@User('_id') userId: string, @Body() dto: MarkUnitsSoldDto) {
    return this.unitService.markAsSold(userId, dto.unitIds, dto.orderId, dto.orderNumber);
  }

  @Post('hold')
  @ApiOperation({ summary: 'Put units on hold (temporarily unavailable, deducts from stock)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: HoldUnitsSchema }))
  async holdUnits(@User('_id') userId: string, @Body() dto: HoldUnitsDto) {
    return this.unitService.holdUnits(userId, dto.unitIds, dto.reason);
  }

  @Post('unhold')
  @ApiOperation({ summary: 'Release units from hold back to in_stock' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: UnholdUnitsSchema }))
  async unholdUnits(@User('_id') userId: string, @Body() dto: UnholdUnitsDto) {
    return this.unitService.unholdUnits(userId, dto.unitIds);
  }

  @Post('damaged')
  @ApiOperation({ summary: 'Mark units as damaged (permanent, cannot be undone)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: MarkDamagedSchema }))
  async markAsDamaged(@User('_id') userId: string, @Body() dto: MarkDamagedDto) {
    return this.unitService.markAsDamaged(userId, dto.unitIds, dto.reason);
  }

  // NOTE: Reserve/Release endpoints have been removed.
  // Units go directly from in_stock to sold via order fulfillment.
  // Status changes must use specific endpoints: hold, unhold, damaged.

  // ========================
  // Delete
  // ========================

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a unit (soft delete)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Unit ID' })
  async delete(@User('_id') userId: string, @Param('id') id: string) {
    return this.unitService.delete(userId, id);
  }
}
