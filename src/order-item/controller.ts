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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JoiValidationPipe } from '../pipes';
import { User } from '../decorators';
import { OrderItemService } from './service';
import { OrderItemSource } from './enum';
import {
  CreateOrderItemDto,
  CreateOrderItemSchema,
  BulkCreateOrderItemsDto,
  BulkCreateOrderItemsSchema,
  UpdateOrderItemDto,
  UpdateOrderItemSchema,
  ReturnOrderItemDto,
  ReturnOrderItemSchema,
  QueryOrderItemsDto,
  QueryOrderItemsSchema,
} from './dto';

@ApiTags('Order Items')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/orders/:orderId/items')
export class OrderItemController {
  constructor(private readonly orderItemService: OrderItemService) {}

  // ========================
  // List and Query Operations
  // ========================

  @Get()
  @ApiOperation({ summary: 'List items for an order' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiQuery({ name: 'stockStatus', required: false })
  @ApiQuery({ name: 'sku', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryOrderItemsSchema }))
  async getItems(
    @Param('orderId') orderId: string,
    @Query() query: QueryOrderItemsDto,
  ) {
    return this.orderItemService.getOrderItems(orderId);
  }

  @Get('totals')
  @ApiOperation({ summary: 'Get order totals from items' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async getTotals(@Param('orderId') orderId: string) {
    return this.orderItemService.getOrderTotals(orderId);
  }

  @Get(':itemId')
  @ApiOperation({ summary: 'Get a single order item' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  async getItem(@Param('itemId') itemId: string) {
    return this.orderItemService.getOrderItem(itemId);
  }

  // ========================
  // Create Operations
  // ========================

  @Post()
  @ApiOperation({ summary: 'Add an item to the order' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @UsePipes(new JoiValidationPipe({ body: CreateOrderItemSchema }))
  async addItem(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateOrderItemDto,
  ) {
    return this.orderItemService.addItem({
      storeId,
      orderId,
      ...dto,
      source: dto.source || OrderItemSource.MANUAL,
    });
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Add multiple items to the order' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @UsePipes(new JoiValidationPipe({ body: BulkCreateOrderItemsSchema }))
  async addItemsBulk(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
    @Query('storeId') storeId: string,
    @Body() dto: BulkCreateOrderItemsDto,
  ) {
    return this.orderItemService.addItemsBulk({
      storeId,
      orderId,
      items: dto.items,
      source: dto.source || OrderItemSource.MANUAL,
    });
  }

  // ========================
  // Update Operations
  // ========================

  @Patch(':itemId')
  @ApiOperation({ summary: 'Update an order item' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateOrderItemSchema }))
  async updateItem(
    @User('_id') userId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.orderItemService.updateItem(itemId, dto);
  }

  // ========================
  // Delete Operations
  // ========================

  @Delete(':itemId')
  @ApiOperation({ summary: 'Remove an item from the order' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  async removeItem(
    @User('_id') userId: string,
    @Param('itemId') itemId: string,
  ) {
    await this.orderItemService.removeItem(itemId);
    return { message: 'Item removed successfully' };
  }

  // ========================
  // Return Operations
  // ========================

  @Post(':itemId/return')
  @ApiOperation({ summary: 'Return an order item (restore stock)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'itemId', description: 'Item ID' })
  @UsePipes(new JoiValidationPipe({ body: ReturnOrderItemSchema }))
  async returnItem(
    @User('_id') userId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReturnOrderItemDto,
  ) {
    return this.orderItemService.returnItem(itemId, dto.quantity, dto.reason);
  }
}
