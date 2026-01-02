import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderItem, OrderItemDocument } from './schema';
import { Order, OrderDocument } from '../order/schema';
import { ProductUnit } from '../product-unit/schema';
import { OrderItemStockStatus, OrderItemSource } from './enum';
import { ProductUnitStatus } from '../product-unit/enum';
import {
  IOrderItem,
  IOrderItemCreate,
  IOrderItemUpdate,
  IOrderItemBulkCreate,
  IOrderTotals,
} from './interface';
import { ProductStockService } from '../product-stock/service';

@Injectable()
export class OrderItemService {
  private readonly logger = new Logger(OrderItemService.name);

  constructor(
    @InjectModel(OrderItem.name) private orderItemModel: Model<OrderItemDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(ProductUnit.name) private productUnitModel: Model<ProductUnit>,
    @Inject(forwardRef(() => ProductStockService))
    private readonly productStockService: ProductStockService,
  ) {}

  /**
   * Convert document to interface
   */
  private toInterface(doc: OrderItemDocument): IOrderItem {
    return {
      _id: doc._id as any,
      storeId: doc.storeId as any,
      orderId: doc.orderId as any,
      productId: doc.productId as any,
      variantId: doc.variantId as any,
      skuId: doc.skuId as any,
      sku: doc.sku,
      externalId: doc.externalId,
      externalProductId: doc.externalProductId,
      externalVariationId: doc.externalVariationId,
      name: doc.name,
      quantity: doc.quantity,
      unitPrice: doc.unitPrice,
      discountAmount: doc.discountAmount,
      taxAmount: doc.taxAmount,
      subtotal: doc.subtotal,
      total: doc.total,
      stockStatus: doc.stockStatus,
      fulfilledUnits: doc.fulfilledUnits as any[],
      fulfilledQuantity: doc.fulfilledQuantity,
      returnedQuantity: doc.returnedQuantity,
      attributes: doc.attributes,
      notes: doc.notes,
      source: doc.source,
      isDeleted: doc.isDeleted,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * Calculate subtotal and total for an item
   */
  private calculateItemTotals(
    quantity: number,
    unitPrice: number,
    discountAmount: number = 0,
    taxAmount: number = 0,
  ): { subtotal: number; total: number } {
    const subtotal = quantity * unitPrice;
    const total = subtotal - discountAmount + taxAmount;
    return { subtotal, total };
  }

  /**
   * Get order items for an order
   */
  async getOrderItems(orderId: string): Promise<IOrderItem[]> {
    const items = await this.orderItemModel.find({
      orderId: new Types.ObjectId(orderId),
      isDeleted: false,
    }).sort({ createdAt: 1 });

    return items.map((item) => this.toInterface(item));
  }

  /**
   * Get a single order item by ID
   */
  async getOrderItem(itemId: string): Promise<IOrderItem> {
    const item = await this.orderItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      isDeleted: false,
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    return this.toInterface(item);
  }

  /**
   * Add an item to an order
   * No stock changes until order is confirmed
   */
  async addItem(dto: IOrderItemCreate): Promise<IOrderItem> {
    const order = await this.orderModel.findById(dto.orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const { subtotal, total } = this.calculateItemTotals(
      dto.quantity,
      dto.unitPrice,
      dto.discountAmount || 0,
      dto.taxAmount || 0,
    );

    const item = new this.orderItemModel({
      storeId: new Types.ObjectId(dto.storeId),
      orderId: new Types.ObjectId(dto.orderId),
      productId: dto.productId ? new Types.ObjectId(dto.productId) : undefined,
      variantId: dto.variantId ? new Types.ObjectId(dto.variantId) : undefined,
      skuId: dto.skuId ? new Types.ObjectId(dto.skuId) : undefined,
      sku: dto.sku,
      name: dto.name,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      discountAmount: dto.discountAmount || 0,
      taxAmount: dto.taxAmount || 0,
      subtotal,
      total,
      stockStatus: OrderItemStockStatus.PENDING,
      fulfilledUnits: [],
      fulfilledQuantity: 0,
      returnedQuantity: 0,
      attributes: dto.attributes,
      notes: dto.notes,
      source: dto.source || OrderItemSource.MANUAL,
      isDeleted: false,
    });

    await item.save();

    // Recalculate order totals
    await this.recalculateOrderTotals(dto.orderId);

    this.logger.log(`Added item "${dto.name}" to order ${dto.orderId}`);
    return this.toInterface(item);
  }

  /**
   * Add multiple items to an order
   */
  async addItemsBulk(dto: IOrderItemBulkCreate): Promise<IOrderItem[]> {
    const order = await this.orderModel.findById(dto.orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items: OrderItemDocument[] = [];

    for (const itemData of dto.items) {
      const { subtotal, total } = this.calculateItemTotals(
        itemData.quantity,
        itemData.unitPrice,
        itemData.discountAmount || 0,
        itemData.taxAmount || 0,
      );

      const item = new this.orderItemModel({
        storeId: new Types.ObjectId(dto.storeId),
        orderId: new Types.ObjectId(dto.orderId),
        productId: itemData.productId ? new Types.ObjectId(itemData.productId) : undefined,
        variantId: itemData.variantId ? new Types.ObjectId(itemData.variantId) : undefined,
        skuId: itemData.skuId ? new Types.ObjectId(itemData.skuId) : undefined,
        sku: itemData.sku,
        name: itemData.name,
        quantity: itemData.quantity,
        unitPrice: itemData.unitPrice,
        discountAmount: itemData.discountAmount || 0,
        taxAmount: itemData.taxAmount || 0,
        subtotal,
        total,
        stockStatus: OrderItemStockStatus.PENDING,
        fulfilledUnits: [],
        fulfilledQuantity: 0,
        returnedQuantity: 0,
        attributes: itemData.attributes,
        notes: itemData.notes,
        source: dto.source || OrderItemSource.MANUAL,
        isDeleted: false,
      });

      items.push(item);
    }

    await this.orderItemModel.insertMany(items);

    // Recalculate order totals
    await this.recalculateOrderTotals(dto.orderId);

    this.logger.log(`Added ${items.length} items to order ${dto.orderId}`);
    return items.map((item) => this.toInterface(item));
  }

  /**
   * Update an order item
   */
  async updateItem(itemId: string, dto: IOrderItemUpdate): Promise<IOrderItem> {
    const item = await this.orderItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      isDeleted: false,
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    // Cannot update fulfilled items
    if (item.stockStatus === OrderItemStockStatus.FULFILLED) {
      throw new BadRequestException('Cannot update fulfilled items');
    }

    // Update fields
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.unitPrice !== undefined) item.unitPrice = dto.unitPrice;
    if (dto.discountAmount !== undefined) item.discountAmount = dto.discountAmount;
    if (dto.taxAmount !== undefined) item.taxAmount = dto.taxAmount;
    if (dto.attributes !== undefined) item.attributes = dto.attributes;
    if (dto.notes !== undefined) item.notes = dto.notes;

    // Recalculate totals
    const { subtotal, total } = this.calculateItemTotals(
      item.quantity,
      item.unitPrice,
      item.discountAmount,
      item.taxAmount,
    );
    item.subtotal = subtotal;
    item.total = total;

    await item.save();

    // Recalculate order totals
    await this.recalculateOrderTotals(item.orderId.toString());

    this.logger.log(`Updated item ${itemId}`);
    return this.toInterface(item);
  }

  /**
   * Remove an order item (soft delete)
   */
  async removeItem(itemId: string): Promise<void> {
    const item = await this.orderItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      isDeleted: false,
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    // Cannot remove fulfilled items
    if (item.stockStatus === OrderItemStockStatus.FULFILLED) {
      throw new BadRequestException('Cannot remove fulfilled items. Use return instead.');
    }

    item.isDeleted = true;
    item.stockStatus = OrderItemStockStatus.CANCELLED;
    await item.save();

    // Recalculate order totals
    await this.recalculateOrderTotals(item.orderId.toString());

    this.logger.log(`Removed item ${itemId} from order ${item.orderId}`);
  }

  /**
   * Fulfill all items for an order (when order is confirmed)
   * Gets available units FIFO and marks them as SOLD
   */
  async fulfillOrderItems(orderId: string, orderNumber: string): Promise<{
    fulfilledItems: number;
    totalUnitsAssigned: number;
    warnings: string[];
  }> {
    const items = await this.orderItemModel.find({
      orderId: new Types.ObjectId(orderId),
      stockStatus: OrderItemStockStatus.PENDING,
      isDeleted: false,
    });

    let fulfilledItems = 0;
    let totalUnitsAssigned = 0;
    const warnings: string[] = [];

    for (const item of items) {
      // Only fulfill items with SKU (unit-tracked items)
      if (!item.skuId || !item.sku) {
        // Mark as fulfilled without units (non-tracked item)
        item.stockStatus = OrderItemStockStatus.FULFILLED;
        item.fulfilledQuantity = item.quantity;
        await item.save();
        fulfilledItems++;
        continue;
      }

      // Get available units FIFO
      const availableUnits = await this.productUnitModel
        .find({
          storeId: item.storeId,
          skuId: item.skuId,
          status: ProductUnitStatus.IN_STOCK,
          isDeleted: false,
        })
        .sort({ productionDate: 1, createdAt: 1 })
        .limit(item.quantity);

      if (availableUnits.length < item.quantity) {
        warnings.push(
          `SKU ${item.sku}: Only ${availableUnits.length} units available, needed ${item.quantity}`,
        );
      }

      if (availableUnits.length > 0) {
        const unitIds = availableUnits.map((u) => u._id);

        // Mark units as SOLD
        await this.productUnitModel.updateMany(
          { _id: { $in: unitIds } },
          {
            $set: {
              status: ProductUnitStatus.SOLD,
              orderId: new Types.ObjectId(orderId),
              orderNumber,
              soldAt: new Date(),
            },
          },
        );

        // Update item with fulfilled units
        item.fulfilledUnits = unitIds as any[];
        item.fulfilledQuantity = availableUnits.length;
        item.stockStatus =
          availableUnits.length >= item.quantity
            ? OrderItemStockStatus.FULFILLED
            : OrderItemStockStatus.PENDING;

        await item.save();

        totalUnitsAssigned += availableUnits.length;
        if (availableUnits.length >= item.quantity) {
          fulfilledItems++;
        }
      }
    }

    this.logger.log(
      `Fulfilled order ${orderId}: ${fulfilledItems} items, ${totalUnitsAssigned} units`,
    );

    return { fulfilledItems, totalUnitsAssigned, warnings };
  }

  /**
   * Return an order item (restore units to in_stock)
   */
  async returnItem(
    itemId: string,
    quantity: number,
    reason?: string,
  ): Promise<IOrderItem> {
    const item = await this.orderItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      isDeleted: false,
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    if (item.stockStatus !== OrderItemStockStatus.FULFILLED) {
      throw new BadRequestException('Can only return fulfilled items');
    }

    const maxReturnable = item.fulfilledQuantity - item.returnedQuantity;
    if (quantity > maxReturnable) {
      throw new BadRequestException(
        `Cannot return ${quantity} units. Maximum returnable: ${maxReturnable}`,
      );
    }

    // Get units to return (LIFO - return newest first)
    const unitsToReturn = await this.productUnitModel
      .find({
        _id: { $in: item.fulfilledUnits },
        status: ProductUnitStatus.SOLD,
      })
      .sort({ soldAt: -1 })
      .limit(quantity);

    if (unitsToReturn.length > 0) {
      const unitIds = unitsToReturn.map((u) => u._id);

      // Return units to in_stock
      await this.productUnitModel.updateMany(
        { _id: { $in: unitIds } },
        {
          $set: {
            status: ProductUnitStatus.IN_STOCK,
          },
          $unset: {
            orderId: 1,
            orderNumber: 1,
            soldAt: 1,
          },
        },
      );

      // Update item
      item.returnedQuantity += unitsToReturn.length;
      item.fulfilledUnits = (item.fulfilledUnits as any[]).filter(
        (id) => !unitIds.some((uid) => uid.equals(id)),
      );

      if (item.returnedQuantity >= item.fulfilledQuantity) {
        item.stockStatus = OrderItemStockStatus.RETURNED;
      }

      if (reason) {
        item.notes = item.notes
          ? `${item.notes}\nReturn: ${reason}`
          : `Return: ${reason}`;
      }

      await item.save();

      this.logger.log(`Returned ${unitsToReturn.length} units for item ${itemId}`);
    }

    // Recalculate order totals
    await this.recalculateOrderTotals(item.orderId.toString());

    return this.toInterface(item);
  }

  /**
   * Cancel all pending items for an order
   */
  async cancelOrderItems(orderId: string): Promise<number> {
    const result = await this.orderItemModel.updateMany(
      {
        orderId: new Types.ObjectId(orderId),
        stockStatus: OrderItemStockStatus.PENDING,
        isDeleted: false,
      },
      {
        $set: {
          stockStatus: OrderItemStockStatus.CANCELLED,
          isDeleted: true,
        },
      },
    );

    this.logger.log(`Cancelled ${result.modifiedCount} items for order ${orderId}`);
    return result.modifiedCount;
  }

  /**
   * Release fulfilled units back to stock (for order cancellation)
   */
  async releaseOrderUnits(orderId: string): Promise<number> {
    const items = await this.orderItemModel.find({
      orderId: new Types.ObjectId(orderId),
      stockStatus: OrderItemStockStatus.FULFILLED,
      isDeleted: false,
    });

    let releasedUnits = 0;

    for (const item of items) {
      if (item.fulfilledUnits.length > 0) {
        // Return units to in_stock
        await this.productUnitModel.updateMany(
          { _id: { $in: item.fulfilledUnits } },
          {
            $set: {
              status: ProductUnitStatus.IN_STOCK,
            },
            $unset: {
              orderId: 1,
              orderNumber: 1,
              soldAt: 1,
            },
          },
        );

        releasedUnits += item.fulfilledUnits.length;

        // Update item
        item.stockStatus = OrderItemStockStatus.CANCELLED;
        item.fulfilledUnits = [];
        item.fulfilledQuantity = 0;
        await item.save();
      }
    }

    this.logger.log(`Released ${releasedUnits} units for order ${orderId}`);
    return releasedUnits;
  }

  /**
   * Recalculate order totals from items
   */
  async recalculateOrderTotals(orderId: string): Promise<IOrderTotals> {
    const items = await this.orderItemModel.find({
      orderId: new Types.ObjectId(orderId),
      isDeleted: false,
    });

    const totals: IOrderTotals = {
      itemsCount: items.length,
      itemsQuantity: 0,
      itemsSubtotal: 0,
      itemsDiscount: 0,
      itemsTax: 0,
      itemsTotal: 0,
    };

    for (const item of items) {
      totals.itemsQuantity += item.quantity;
      totals.itemsSubtotal += item.subtotal;
      totals.itemsDiscount += item.discountAmount;
      totals.itemsTax += item.taxAmount;
      totals.itemsTotal += item.total;
    }

    // Get order to include shipping in total calculation
    const order = await this.orderModel.findById(orderId);
    const shippingTotal = parseFloat(order?.shippingTotal || '0');
    const orderTotal = totals.itemsTotal + shippingTotal;

    // Update order with calculated totals
    await this.orderModel.updateOne(
      { _id: new Types.ObjectId(orderId) },
      {
        $set: {
          itemsCount: totals.itemsCount,
          itemsQuantity: totals.itemsQuantity,
          itemsSubtotal: totals.itemsSubtotal,
          total: String(orderTotal),
        },
      },
    );

    return totals;
  }

  /**
   * Get order totals
   */
  async getOrderTotals(orderId: string): Promise<IOrderTotals> {
    return this.recalculateOrderTotals(orderId);
  }

  /**
   * Fulfill stock for a WooCommerce line item
   * Used when WooCommerce orders are received with processing/completed status
   * Finds available ProductUnits by SKU and marks them as SOLD
   */
  async fulfillWooLineItem(
    storeId: string,
    orderId: string,
    orderNumber: string,
    sku: string,
    quantity: number,
  ): Promise<{ fulfilled: number; warning?: string }> {
    const storeObjectId = new Types.ObjectId(storeId);
    const orderObjectId = new Types.ObjectId(orderId);

    // Find available units for this SKU (FIFO - oldest first)
    const availableUnits = await this.productUnitModel
      .find({
        storeId: storeObjectId,
        sku: sku,
        status: ProductUnitStatus.IN_STOCK,
        isDeleted: false,
      })
      .sort({ productionDate: 1, createdAt: 1 })
      .limit(quantity)
      .lean();

    if (availableUnits.length === 0) {
      return {
        fulfilled: 0,
        warning: `SKU ${sku}: No units available in CartFlow inventory`,
      };
    }

    const unitIds = availableUnits.map((u) => u._id);

    // Mark units as SOLD
    await this.productUnitModel.updateMany(
      { _id: { $in: unitIds } },
      {
        $set: {
          status: ProductUnitStatus.SOLD,
          orderId: orderObjectId,
          orderNumber: orderNumber,
          soldAt: new Date(),
        },
      },
    );

    // Sync ProductStock for affected SKU
    const skuId = availableUnits[0].skuId;
    if (skuId) {
      try {
        // Count remaining in_stock units for this SKU
        const inStockCount = await this.productUnitModel.countDocuments({
          storeId: storeObjectId,
          skuId: skuId,
          status: ProductUnitStatus.IN_STOCK,
          isDeleted: false,
        });

        // Sync ProductStock with new in_stock count
        await this.productStockService.syncFromUnits(storeId, skuId.toString(), inStockCount);
        this.logger.log(`SKU ${sku}: Marked ${availableUnits.length} units as SOLD, ${inStockCount} remaining in stock`);
      } catch (error) {
        this.logger.warn(`Failed to sync stock for SKU ${sku}: ${error.message}`);
      }
    }

    // Return result
    if (availableUnits.length < quantity) {
      return {
        fulfilled: availableUnits.length,
        warning: `SKU ${sku}: Only ${availableUnits.length} of ${quantity} units available`,
      };
    }

    return { fulfilled: availableUnits.length };
  }
}
