import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from './service';
import { QueryOrderDto, QueryOrderSchema } from './dto.query';
import { UpdateOrderDto, UpdateOrderSchema, AddTrackingDto, AddTrackingSchema, AddOrderNoteDto, AddOrderNoteSchema, BulkUpdateStatusDto, BulkUpdateStatusSchema, CreateRefundDto, CreateRefundSchema, BatchOrdersDto, BatchOrdersSchema, BatchCreateOrderItemDto, BatchCreateOrderItemSchema } from './dto.update';
import { IOrder, IOrderResponse, IOrderStats } from './interface';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders' })
  @ApiResponse({ status: 200, description: 'Returns paginated orders' })
  @UsePipes(new JoiValidationPipe({ query: QueryOrderSchema, param: { lang: LanguageSchema } }))
  async findAll(
    @User('_id') userId: string,
    @Query() query: QueryOrderDto,
  ): Promise<IOrderResponse> {
    return this.orderService.findAll(userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get order statistics' })
  @ApiResponse({ status: 200, description: 'Returns order statistics' })
  async getStats(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<IOrderStats> {
    return this.orderService.getStats(
      userId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Export orders to CSV' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @UsePipes(new JoiValidationPipe({ query: QueryOrderSchema, param: { lang: LanguageSchema } }))
  async exportCsv(
    @User('_id') userId: string,
    @Query() query: QueryOrderDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.orderService.exportToCsv(userId, query);
    const filename = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  }

  @Post('bulk-status')
  @ApiOperation({ summary: 'Bulk update order status' })
  @ApiResponse({ status: 200, description: 'Orders updated' })
  @UsePipes(new JoiValidationPipe({ body: BulkUpdateStatusSchema, param: { lang: LanguageSchema } }))
  async bulkUpdateStatus(
    @User('_id') userId: string,
    @Body() dto: BulkUpdateStatusDto,
  ) {
    return this.orderService.bulkUpdateStatus(
      userId,
      dto.orderIds,
      dto.status,
      dto.syncToStore ?? true,
    );
  }

  // ========================
  // WooCommerce Batch Endpoints
  // IMPORTANT: These must come BEFORE :id routes to avoid route conflicts
  // ========================

  @Post('woo/batch')
  @ApiOperation({ summary: 'Batch create, update, and delete orders in WooCommerce' })
  @ApiResponse({ status: 200, description: 'Batch operation completed' })
  @UsePipes(new JoiValidationPipe({ body: BatchOrdersSchema, param: { lang: LanguageSchema } }))
  async batchOrders(
    @User('_id') userId: string,
    @Body() dto: BatchOrdersDto,
  ) {
    return this.orderService.batchOrders(userId, dto);
  }

  @Post('woo/create')
  @ApiOperation({ summary: 'Create a single order in WooCommerce' })
  @ApiResponse({ status: 201, description: 'Order created in WooCommerce' })
  @UsePipes(new JoiValidationPipe({ body: BatchCreateOrderItemSchema, param: { lang: LanguageSchema } }))
  async createWooOrder(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: BatchCreateOrderItemDto,
  ): Promise<IOrder> {
    return this.orderService.createWooOrder(userId, storeId, dto);
  }

  @Patch('woo/:wooOrderId')
  @ApiOperation({ summary: 'Update an order in WooCommerce with full field support' })
  @ApiResponse({ status: 200, description: 'Order updated in WooCommerce' })
  async updateWooOrder(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Param('wooOrderId') wooOrderId: number,
    @Body() updateData: {
      status?: string;
      billing?: any;
      shipping?: any;
      line_items?: any[];
      shipping_lines?: any[];
      fee_lines?: any[];
      coupon_lines?: any[];
      customer_note?: string;
      meta_data?: Array<{ key: string; value: string }>;
    },
  ) {
    return this.orderService.updateWooOrder(userId, storeId, Number(wooOrderId), updateData);
  }

  @Delete('woo/:wooOrderId')
  @ApiOperation({ summary: 'Delete an order from WooCommerce' })
  @ApiResponse({ status: 200, description: 'Order deleted from WooCommerce' })
  async deleteWooOrder(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Param('wooOrderId') wooOrderId: number,
    @Query('force') force?: boolean,
  ) {
    return this.orderService.deleteWooOrder(userId, storeId, Number(wooOrderId), force === true);
  }

  @Post('woo/bulk-delete')
  @ApiOperation({ summary: 'Bulk delete orders from WooCommerce' })
  @ApiResponse({ status: 200, description: 'Orders deleted from WooCommerce' })
  async bulkDeleteWooOrders(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body('orderIds') wooOrderIds: number[],
    @Query('force') force?: boolean,
  ) {
    return this.orderService.bulkDeleteWooOrders(userId, storeId, wooOrderIds, force === true);
  }

  // ========================
  // Order ID-based Endpoints
  // ========================

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Returns order details' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findById(
    @Param('id') id: string,
    @User('_id') userId: string,
  ): Promise<IOrder> {
    return this.orderService.findById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order internal fields' })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @UsePipes(new JoiValidationPipe({ body: UpdateOrderSchema, param: { lang: LanguageSchema } }))
  async update(
    @Param('id') id: string,
    @User('_id') userId: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<IOrder> {
    return this.orderService.update(id, userId, dto);
  }

  @Post(':id/tracking')
  @ApiOperation({ summary: 'Add tracking info to order' })
  @ApiResponse({ status: 200, description: 'Tracking added' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @UsePipes(new JoiValidationPipe({ body: AddTrackingSchema, param: { lang: LanguageSchema } }))
  async addTracking(
    @Param('id') id: string,
    @User('_id') userId: string,
    @Body() dto: AddTrackingDto,
  ): Promise<IOrder> {
    return this.orderService.addTracking(id, userId, dto);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add note to order' })
  @ApiResponse({ status: 200, description: 'Note added' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @UsePipes(new JoiValidationPipe({ body: AddOrderNoteSchema, param: { lang: LanguageSchema } }))
  async addNote(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Body() dto: AddOrderNoteDto,
  ): Promise<IOrder> {
    const userName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;
    return this.orderService.addNote(id, user._id.toString(), userName, dto);
  }

  @Delete(':id/notes/:noteId')
  @ApiOperation({ summary: 'Delete note from order' })
  @ApiResponse({ status: 200, description: 'Note deleted' })
  @ApiResponse({ status: 404, description: 'Order or note not found' })
  async deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @User('_id') userId: string,
  ): Promise<IOrder> {
    return this.orderService.deleteNote(id, noteId, userId);
  }

  @Get(':id/print')
  @ApiOperation({ summary: 'Get order print data (packing slip)' })
  @ApiResponse({ status: 200, description: 'Returns order print data' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getPrintData(
    @Param('id') id: string,
    @User('_id') userId: string,
  ) {
    return this.orderService.getPrintData(id, userId);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Create a refund for an order' })
  @ApiResponse({ status: 200, description: 'Refund created' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @UsePipes(new JoiValidationPipe({ body: CreateRefundSchema, param: { lang: LanguageSchema } }))
  async createRefund(
    @Param('id') id: string,
    @User('_id') userId: string,
    @Body() dto: CreateRefundDto,
  ): Promise<IOrder> {
    return this.orderService.createRefund(id, userId, dto);
  }

  @Get(':id/refunds')
  @ApiOperation({ summary: 'Get refunds for an order' })
  @ApiResponse({ status: 200, description: 'Returns order refunds' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getRefunds(
    @Param('id') id: string,
    @User('_id') userId: string,
  ) {
    return this.orderService.getRefunds(id, userId);
  }

  // ========================
  // Manual Order Endpoints
  // ========================

  @Post()
  @ApiOperation({ summary: 'Create a new manual order (draft)' })
  @ApiResponse({ status: 201, description: 'Manual order created' })
  async createManualOrder(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: any,
  ): Promise<IOrder> {
    return this.orderService.createManualOrder(storeId, userId, dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm a draft order (deducts stock)' })
  @ApiResponse({ status: 200, description: 'Order confirmed' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async confirmOrder(
    @Param('id') id: string,
    @User('_id') userId: string,
  ): Promise<IOrder> {
    return this.orderService.confirmOrder(id, userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order (restores stock if confirmed)' })
  @ApiResponse({ status: 200, description: 'Order cancelled' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancelOrder(
    @Param('id') id: string,
    @User('_id') userId: string,
    @Body('reason') reason?: string,
  ): Promise<IOrder> {
    return this.orderService.cancelOrder(id, userId, reason);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Transition order to a new status' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async transitionStatus(
    @Param('id') id: string,
    @User('_id') userId: string,
    @Body('status') status: string,
  ): Promise<IOrder> {
    return this.orderService.transitionStatus(id, userId, status as any);
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone an order (for reordering)' })
  @ApiResponse({ status: 201, description: 'Order cloned' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cloneOrder(
    @Param('id') id: string,
    @User('_id') userId: string,
  ): Promise<IOrder> {
    return this.orderService.cloneOrder(id, userId);
  }
}
