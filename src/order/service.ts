import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schema';
import {
  UpdateOrderDto,
  AddTrackingDto,
  AddOrderNoteDto,
  BatchOrdersDto,
  BatchCreateOrderItemDto,
  BatchUpdateOrderItemDto,
} from './dto.update';
import { QueryOrderDto } from './dto.query';
import {
  IOrder,
  IOrderResponse,
  IOrderStats,
  ICreateManualOrderDto,
} from './interface';
import {
  OrderStatus,
  PaymentStatus,
  FulfillmentStatus,
  OrderSource,
} from './enum';
import { OrderItemService } from '../order-item/service';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooOrder } from '../integrations/woocommerce/woocommerce.types';
import { CustomerService } from '../customer/service';
import { PhoneService } from '../phone/service';
import { EmailService } from '../email/service';
import { ReviewRequestService } from '../review-request/service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly wooCommerceService: WooCommerceService,
    @Inject(forwardRef(() => CustomerService))
    private readonly customerService: CustomerService,
    @Inject(forwardRef(() => PhoneService))
    private readonly phoneService: PhoneService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => OrderItemService))
    private readonly orderItemService: OrderItemService,
    @Inject(forwardRef(() => ReviewRequestService))
    private readonly reviewRequestService: ReviewRequestService,
  ) {}

  /**
   * Get store IDs that user has access to (owner or member)
   */
  private async getUserStoreIds(userId: string): Promise<Types.ObjectId[]> {
    const stores = await this.storeModel
      .find({
        isDeleted: false,
        $or: [
          { ownerId: new Types.ObjectId(userId) },
          { 'members.userId': new Types.ObjectId(userId) },
        ],
      })
      .select('_id');
    return stores.map((store) => store._id);
  }

  /**
   * Verify user has access to a specific store
   */
  private async verifyStoreAccess(
    storeId: string,
    userId: string,
    includeCredentials = false,
  ): Promise<StoreDocument> {
    let query = this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (includeCredentials) {
      query = query.select('+credentials');
    }

    const store = await query;

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  /**
   * Get orders with filtering and pagination
   */
  async findAll(userId: string, query: QueryOrderDto): Promise<IOrderResponse> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    // Apply filters
    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }
    if (query.fulfillmentStatus) {
      filter.fulfillmentStatus = query.fulfillmentStatus;
    }
    if (query.customerId) {
      filter.localCustomerId = new Types.ObjectId(query.customerId);
    }
    if (query.startDate || query.endDate) {
      filter.dateCreatedWoo = {};
      if (query.startDate)
        filter.dateCreatedWoo.$gte = new Date(query.startDate);
      if (query.endDate) filter.dateCreatedWoo.$lte = new Date(query.endDate);
    }
    if (query.minTotal !== undefined || query.maxTotal !== undefined) {
      filter.$expr = { $and: [] };
      if (query.minTotal !== undefined) {
        filter.$expr.$and.push({
          $gte: [{ $toDouble: '$total' }, query.minTotal],
        });
      }
      if (query.maxTotal !== undefined) {
        filter.$expr.$and.push({
          $lte: [{ $toDouble: '$total' }, query.maxTotal],
        });
      }
    }
    if (query.keyword) {
      filter.$or = [
        { orderNumber: { $regex: query.keyword, $options: 'i' } },
        { 'billing.email': { $regex: query.keyword, $options: 'i' } },
        { 'billing.phone': { $regex: query.keyword, $options: 'i' } },
        { 'billing.firstName': { $regex: query.keyword, $options: 'i' } },
        { 'billing.lastName': { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'dateCreatedWoo';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort(sort).skip(skip).limit(size),
      this.orderModel.countDocuments(filter),
    ]);

    return {
      orders: orders.map((o) => this.toInterface(o)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get order by ID
   */
  async findById(id: string, userId: string): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    const result = this.toInterface(order);

    // For manual orders, fetch order items from separate collection
    if (order.useSeparateItems) {
      const orderItems = await this.orderItemService.getOrderItems(id);
      result.orderItems = orderItems.map((item) => ({
        _id: item._id?.toString() || '',
        storeId: item.storeId?.toString() || '',
        orderId: item.orderId?.toString() || '',
        productId: item.productId?.toString(),
        variantId: item.variantId?.toString(),
        skuId: item.skuId?.toString(),
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
        subtotal: item.subtotal,
        total: item.total,
        stockStatus: item.stockStatus,
        fulfilledQuantity: item.fulfilledQuantity,
        returnedQuantity: item.returnedQuantity,
        attributes: item.attributes,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    }

    return result;
  }

  /**
   * Update order (status, fulfillment, tracking, notes)
   * Optionally syncs status changes back to WooCommerce
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateOrderDto,
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    const oldStatus = order.status;
    const statusChanged = dto.status && dto.status !== oldStatus;

    // Update fields
    if (dto.status) order.status = dto.status;
    if (dto.paymentStatus) order.paymentStatus = dto.paymentStatus;
    if (dto.fulfillmentStatus) order.fulfillmentStatus = dto.fulfillmentStatus;
    if (dto.trackingNumber) order.trackingNumber = dto.trackingNumber;
    if (dto.trackingCarrier) order.trackingCarrier = dto.trackingCarrier;
    if (dto.trackingUrl) order.trackingUrl = dto.trackingUrl;
    if (dto.internalNotes !== undefined)
      order.internalNotes = dto.internalNotes;
    if (dto.tags) order.tags = dto.tags;

    // Auto-update fulfillment status based on order status
    if (dto.status === OrderStatus.COMPLETED && !dto.fulfillmentStatus) {
      order.fulfillmentStatus = FulfillmentStatus.DELIVERED;
      order.dateCompleted = new Date();
    }

    await order.save();

    // Sync status change to WooCommerce if requested (default: true)
    if (statusChanged && dto.syncToStore !== false) {
      try {
        await this.syncOrderStatusToWoo(order);
        this.logger.log(
          `Order ${order.orderNumber} status synced to WooCommerce: ${dto.status}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to sync order status to WooCommerce: ${error.message}`,
        );
        // Don't throw - local update succeeded, just log the sync failure
      }
    }

    return this.toInterface(order);
  }

  /**
   * Sync order status to WooCommerce
   */
  private async syncOrderStatusToWoo(order: OrderDocument): Promise<void> {
    const store = await this.storeModel.findById(order.storeId).select('+credentials');
    if (!store) {
      throw new Error('Store not found');
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    await this.wooCommerceService.updateOrder(credentials, order.externalId, {
      status: order.status,
    });
  }

  /**
   * Add tracking info to order
   */
  async addTracking(
    id: string,
    userId: string,
    dto: AddTrackingDto,
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    order.trackingNumber = dto.trackingNumber;
    order.trackingCarrier = dto.trackingCarrier;
    if (dto.trackingUrl) order.trackingUrl = dto.trackingUrl;
    order.fulfillmentStatus = FulfillmentStatus.SHIPPED;

    await order.save();
    return this.toInterface(order);
  }

  /**
   * Bulk update order status
   */
  async bulkUpdateStatus(
    userId: string,
    orderIds: string[],
    status: OrderStatus,
    syncToStore = true,
  ): Promise<{ updated: number; failed: number; errors: string[] }> {
    const storeIds = await this.getUserStoreIds(userId);

    const orders = await this.orderModel.find({
      _id: { $in: orderIds.map((id) => new Types.ObjectId(id)) },
      storeId: { $in: storeIds },
      isDeleted: false,
    });

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const order of orders) {
      try {
        const oldStatus = order.status;
        order.status = status;

        // Auto-update fulfillment status based on order status
        if (status === OrderStatus.COMPLETED) {
          order.fulfillmentStatus = FulfillmentStatus.DELIVERED;
          order.dateCompleted = new Date();
        }

        await order.save();
        updated++;

        // Sync to WooCommerce if requested
        if (syncToStore && order.externalId) {
          try {
            await this.syncOrderStatusToWoo(order);
          } catch (syncError) {
            this.logger.error(
              `Failed to sync order ${order.orderNumber} to WooCommerce: ${syncError.message}`,
            );
          }
        }
      } catch (error) {
        failed++;
        errors.push(`Order ${order.orderNumber}: ${error.message}`);
      }
    }

    this.logger.log(`Bulk status update: ${updated} updated, ${failed} failed`);
    return { updated, failed, errors };
  }

  /**
   * Add note to order
   */
  async addNote(
    id: string,
    userId: string,
    userName: string,
    dto: AddOrderNoteDto,
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    const note = {
      _id: new Types.ObjectId(),
      content: dto.content,
      isCustomerNote: dto.isCustomerNote || false,
      addedBy: userName,
      addedByUserId: new Types.ObjectId(userId),
      createdAt: new Date(),
    };

    order.notes.push(note as any);
    await order.save();

    this.logger.log(`Note added to order ${order.orderNumber} by ${userName}`);
    return this.toInterface(order);
  }

  /**
   * Delete note from order
   */
  async deleteNote(
    id: string,
    noteId: string,
    userId: string,
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    const noteIndex = order.notes.findIndex(
      (n: any) => n._id.toString() === noteId,
    );

    if (noteIndex === -1) {
      throw new NotFoundException('Note not found');
    }

    order.notes.splice(noteIndex, 1);
    await order.save();

    this.logger.log(`Note ${noteId} deleted from order ${order.orderNumber}`);
    return this.toInterface(order);
  }

  /**
   * Get order statistics
   */
  async getStats(
    userId: string,
    storeId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<IOrderStats> {
    const storeIds = await this.getUserStoreIds(userId);

    const baseFilter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      baseFilter.storeId = new Types.ObjectId(storeId);
    }
    if (startDate || endDate) {
      baseFilter.dateCreatedWoo = {};
      if (startDate) baseFilter.dateCreatedWoo.$gte = startDate;
      if (endDate) baseFilter.dateCreatedWoo.$lte = endDate;
    }

    // Statuses to exclude from order count and revenue
    const excludedStatuses = [
      OrderStatus.DRAFT,
      OrderStatus.CANCELLED,
      OrderStatus.FAILED,
      OrderStatus.REFUNDED,
    ];

    // Filter for counting orders (exclude draft, cancelled, failed, refunded)
    const countFilter = {
      ...baseFilter,
      status: { $nin: excludedStatuses },
    };

    const [
      totalOrders,
      revenueResult,
      refundsResult,
      statusCounts,
      recentOrders,
    ] = await Promise.all([
      // Count only valid orders (not draft, cancelled, failed, refunded)
      this.orderModel.countDocuments(countFilter),
      // Sum revenue only from valid orders
      this.orderModel.aggregate([
        { $match: countFilter },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $toDouble: '$total' } },
          },
        },
      ]),
      // Calculate total refunds to deduct from revenue
      this.orderModel.aggregate([
        { $match: baseFilter },
        { $unwind: { path: '$refunds', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            totalRefunds: { $sum: { $toDouble: '$refunds.total' } },
          },
        },
      ]),
      // Status counts include all orders for the breakdown
      this.orderModel.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.orderModel.find(baseFilter).sort({ dateCreatedWoo: -1 }).limit(5),
    ]);

    const grossRevenue = revenueResult[0]?.totalRevenue || 0;
    const totalRefunds = refundsResult[0]?.totalRefunds || 0;
    const totalRevenue = grossRevenue - totalRefunds;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const ordersByStatus: Record<OrderStatus, number> = {} as Record<
      OrderStatus,
      number
    >;
    Object.values(OrderStatus).forEach((status) => {
      ordersByStatus[status] = 0;
    });
    statusCounts.forEach((item: any) => {
      ordersByStatus[item._id as OrderStatus] = item.count;
    });

    return {
      totalOrders,
      totalRevenue,
      averageOrderValue,
      ordersByStatus,
      recentOrders: recentOrders.map((o) => this.toInterface(o)),
    };
  }

  /**
   * Get order count by store
   */
  async getOrderCountByStore(storeId: string): Promise<number> {
    return this.orderModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  /**
   * Export orders to CSV
   */
  async exportToCsv(userId: string, query: QueryOrderDto): Promise<string> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    // Apply filters
    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }
    if (query.startDate || query.endDate) {
      filter.dateCreatedWoo = {};
      if (query.startDate)
        filter.dateCreatedWoo.$gte = new Date(query.startDate);
      if (query.endDate) filter.dateCreatedWoo.$lte = new Date(query.endDate);
    }

    const orders = await this.orderModel
      .find(filter)
      .sort({ dateCreatedWoo: -1 })
      .limit(10000); // Max 10k orders

    // CSV Header
    const headers = [
      'Order Number',
      'Status',
      'Payment Status',
      'Date',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Billing Address',
      'Shipping Address',
      'Items Count',
      'Subtotal',
      'Shipping',
      'Discount',
      'Total',
      'Currency',
      'Payment Method',
      'Customer Note',
    ];

    // CSV Rows
    const rows = orders.map((order) => {
      const billingAddress = [
        order.billing?.address1,
        order.billing?.city,
        order.billing?.state,
        order.billing?.postcode,
        order.billing?.country,
      ]
        .filter(Boolean)
        .join(', ');

      const shippingAddress = [
        order.shipping?.address1,
        order.shipping?.city,
        order.shipping?.state,
        order.shipping?.postcode,
        order.shipping?.country,
      ]
        .filter(Boolean)
        .join(', ');

      return [
        order.orderNumber,
        order.status,
        order.paymentStatus,
        order.dateCreatedWoo
          ? new Date(order.dateCreatedWoo).toISOString().split('T')[0]
          : '',
        `${order.billing?.firstName || ''} ${
          order.billing?.lastName || ''
        }`.trim(),
        order.billing?.email || '',
        order.billing?.phone || '',
        billingAddress,
        shippingAddress,
        order.lineItems?.length || 0,
        parseFloat(order.total || '0') -
          parseFloat(order.shippingTotal || '0') -
          parseFloat(order.discountTotal || '0'),
        order.shippingTotal || '0',
        order.discountTotal || '0',
        order.total || '0',
        order.currency || 'USD',
        order.paymentMethodTitle || order.paymentMethod || '',
        order.customerNote || '',
      ];
    });

    // Escape CSV values
    const escapeValue = (val: any): string => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV with UTF-8 BOM for Arabic text support
    const BOM = '\uFEFF';
    const csvContent =
      BOM +
      [
        headers.map(escapeValue).join(','),
        ...rows.map((row) => row.map(escapeValue).join(',')),
      ].join('\n');

    return csvContent;
  }

  /**
   * Reverse-convert an amount from payment currency back to store base currency
   */
  private reverseConvertAmount(
    amount: string | number,
    rate: number,
    decimals = 2,
  ): string {
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(num) || rate <= 0) return String(amount);
    return (num / rate).toFixed(decimals);
  }

  private extractVariantAttributes(
    metaData: any[],
  ): Record<string, string> | undefined {
    if (!metaData?.length) return undefined;
    const attrs: Record<string, string> = {};
    for (const meta of metaData) {
      if (
        meta.key?.startsWith('pa_') ||
        (meta.display_key && meta.display_key !== meta.key)
      ) {
        attrs[meta.display_key || meta.key] = meta.display_value || meta.value;
      }
    }
    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  /**
   * Extract CartFlow Bridge currency conversion metadata from WooCommerce order
   */
  private extractCurrencyConversionMeta(
    metaData: Array<{ key: string; value: any }>,
  ): {
    originalCurrency: string;
    originalTotal: number;
    exchangeRate: number;
  } | null {
    if (!metaData?.length) return null;
    const get = (key: string) => metaData.find((m) => m.key === key)?.value;
    const originalCurrency = get('_cartflow_original_currency');
    const exchangeRate = parseFloat(get('_cartflow_exchange_rate'));
    if (!originalCurrency || !exchangeRate || exchangeRate <= 0) return null;
    return {
      originalCurrency: String(originalCurrency),
      originalTotal:
        parseFloat(get('_cartflow_original_total')) || 0,
      exchangeRate,
    };
  }

  /**
   * Upsert order from WooCommerce data (used during sync)
   */
  async upsertFromWoo(
    storeId: string,
    wooOrder: WooOrder,
  ): Promise<OrderDocument> {
    const existingOrder = await this.orderModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: wooOrder.id,
    });

    const orderData: any = {
      storeId: new Types.ObjectId(storeId),
      externalId: wooOrder.id,
      orderNumber: wooOrder.number,
      orderKey: wooOrder.order_key,
      status: wooOrder.status as OrderStatus,
      paymentStatus: wooOrder.date_paid
        ? PaymentStatus.PAID
        : PaymentStatus.PENDING,
      fulfillmentStatus:
        wooOrder.status === 'completed'
          ? FulfillmentStatus.DELIVERED
          : FulfillmentStatus.UNFULFILLED,
      currency: wooOrder.currency,
      pricesIncludeTax: wooOrder.prices_include_tax,
      discountTotal: wooOrder.discount_total,
      discountTax: wooOrder.discount_tax,
      shippingTotal: wooOrder.shipping_total,
      shippingTax: wooOrder.shipping_tax,
      cartTax: wooOrder.cart_tax,
      total: wooOrder.total,
      totalTax: wooOrder.total_tax,
      customerId: wooOrder.customer_id,
      customerNote: wooOrder.customer_note,
      billing: {
        firstName: wooOrder.billing.first_name,
        lastName: wooOrder.billing.last_name,
        company: wooOrder.billing.company,
        address1: wooOrder.billing.address_1,
        address2: wooOrder.billing.address_2,
        city: wooOrder.billing.city,
        state: wooOrder.billing.state,
        postcode: wooOrder.billing.postcode,
        country: wooOrder.billing.country,
        email: wooOrder.billing.email,
        phone: wooOrder.billing.phone,
      },
      shipping: {
        firstName: wooOrder.shipping.first_name,
        lastName: wooOrder.shipping.last_name,
        company: wooOrder.shipping.company,
        address1: wooOrder.shipping.address_1,
        address2: wooOrder.shipping.address_2,
        city: wooOrder.shipping.city,
        state: wooOrder.shipping.state,
        postcode: wooOrder.shipping.postcode,
        country: wooOrder.shipping.country,
      },
      paymentMethod: wooOrder.payment_method,
      paymentMethodTitle: wooOrder.payment_method_title,
      transactionId: wooOrder.transaction_id,
      datePaid: wooOrder.date_paid ? new Date(wooOrder.date_paid) : undefined,
      dateCompleted: wooOrder.date_completed
        ? new Date(wooOrder.date_completed)
        : undefined,
      lineItems: wooOrder.line_items.map((item) => ({
        externalId: item.id,
        name: item.name,
        productId: item.product_id,
        variationId: item.variation_id,
        quantity: item.quantity,
        sku: item.sku,
        image: item.image?.src,
        price: item.price,
        subtotal: item.subtotal,
        subtotalTax: item.subtotal_tax,
        total: item.total,
        totalTax: item.total_tax,
        taxClass: item.tax_class,
        attributes: this.extractVariantAttributes(item.meta_data),
        metaData: item.meta_data,
      })),
      shippingLines:
        wooOrder.shipping_lines?.map((line) => ({
          externalId: line.id,
          methodTitle: line.method_title,
          methodId: line.method_id,
          total: line.total,
          totalTax: line.total_tax,
        })) || [],
      feeLines:
        wooOrder.fee_lines?.map((line) => ({
          externalId: line.id,
          name: line.name,
          total: line.total,
          totalTax: line.total_tax,
        })) || [],
      couponLines:
        wooOrder.coupon_lines?.map((line) => ({
          externalId: line.id,
          code: line.code,
          discount: line.discount,
          discountTax: line.discount_tax,
        })) || [],
      createdVia: wooOrder.created_via,
      dateCreatedWoo: new Date(wooOrder.date_created),
      dateModifiedWoo: new Date(wooOrder.date_modified),
      lastSyncedAt: new Date(),
      isDeleted: false,
    };

    // Reverse-convert amounts if CartFlow Bridge currency conversion was applied
    const conversionMeta = this.extractCurrencyConversionMeta(
      wooOrder.meta_data || [],
    );
    if (conversionMeta) {
      const { originalCurrency, exchangeRate } = conversionMeta;
      const d = 2;

      // Save payment gateway info
      orderData.paidCurrency = wooOrder.currency;
      orderData.paidTotal = wooOrder.total;
      orderData.conversionRate = exchangeRate;

      // Override to store base currency
      orderData.currency = originalCurrency;

      // The bridge converts line-level items (shipping_lines, coupon_lines,
      // fee_lines) but has a bug where it doesn't update the order-level
      // summary fields (shipping_total, discount_total). Derive these from
      // the line items which ARE correctly converted.
      const shippingFromLines = (wooOrder.shipping_lines || [])
        .reduce((sum, line) => sum + parseFloat(line.total || '0'), 0);
      const shippingTaxFromLines = (wooOrder.shipping_lines || [])
        .reduce((sum, line) => sum + parseFloat(line.total_tax || '0'), 0);
      const discountFromLines = (wooOrder.coupon_lines || [])
        .reduce((sum, line) => sum + parseFloat(line.discount || '0'), 0);
      const discountTaxFromLines = (wooOrder.coupon_lines || [])
        .reduce((sum, line) => sum + parseFloat(line.discount_tax || '0'), 0);

      // Reverse-convert all totals
      orderData.total = this.reverseConvertAmount(wooOrder.total, exchangeRate, d);
      orderData.discountTotal = this.reverseConvertAmount(discountFromLines, exchangeRate, d);
      orderData.discountTax = this.reverseConvertAmount(discountTaxFromLines, exchangeRate, d);
      orderData.shippingTotal = this.reverseConvertAmount(shippingFromLines, exchangeRate, d);
      orderData.shippingTax = this.reverseConvertAmount(shippingTaxFromLines, exchangeRate, d);
      orderData.cartTax = this.reverseConvertAmount(wooOrder.cart_tax, exchangeRate, d);
      orderData.totalTax = this.reverseConvertAmount(wooOrder.total_tax, exchangeRate, d);

      // Reverse-convert line items
      orderData.lineItems = wooOrder.line_items.map((item) => ({
        externalId: item.id,
        name: item.name,
        productId: item.product_id,
        variationId: item.variation_id,
        quantity: item.quantity,
        sku: item.sku,
        image: item.image?.src,
        price: parseFloat(this.reverseConvertAmount(item.price, exchangeRate, d)),
        subtotal: this.reverseConvertAmount(item.subtotal, exchangeRate, d),
        subtotalTax: this.reverseConvertAmount(item.subtotal_tax, exchangeRate, d),
        total: this.reverseConvertAmount(item.total, exchangeRate, d),
        totalTax: this.reverseConvertAmount(item.total_tax, exchangeRate, d),
        taxClass: item.tax_class,
        attributes: this.extractVariantAttributes(item.meta_data),
        metaData: item.meta_data,
      }));

      // Reverse-convert shipping lines (these are correctly converted by bridge)
      orderData.shippingLines = (wooOrder.shipping_lines || []).map((line) => ({
        externalId: line.id,
        methodTitle: line.method_title,
        methodId: line.method_id,
        total: this.reverseConvertAmount(line.total, exchangeRate, d),
        totalTax: this.reverseConvertAmount(line.total_tax, exchangeRate, d),
      }));

      // Reverse-convert fee lines
      orderData.feeLines = (wooOrder.fee_lines || []).map((line) => ({
        externalId: line.id,
        name: line.name,
        total: this.reverseConvertAmount(line.total, exchangeRate, d),
        totalTax: this.reverseConvertAmount(line.total_tax, exchangeRate, d),
      }));

      // Reverse-convert coupon lines
      orderData.couponLines = (wooOrder.coupon_lines || []).map((line) => ({
        externalId: line.id,
        code: line.code,
        discount: this.reverseConvertAmount(line.discount, exchangeRate, d),
        discountTax: this.reverseConvertAmount(line.discount_tax, exchangeRate, d),
      }));
    }

    // Find or create customer from order billing info (every order must have a customer)
    let localCustomerId: Types.ObjectId | undefined;
    try {
      const customer = await this.customerService.findOrCreateFromOrder(
        storeId,
        {
          email: wooOrder.billing?.email,
          firstName: wooOrder.billing?.first_name,
          lastName: wooOrder.billing?.last_name,
          phone: wooOrder.billing?.phone,
          company: wooOrder.billing?.company,
          address1: wooOrder.billing?.address_1,
          address2: wooOrder.billing?.address_2,
          city: wooOrder.billing?.city,
          state: wooOrder.billing?.state,
          postcode: wooOrder.billing?.postcode,
          country: wooOrder.billing?.country,
        },
        wooOrder.customer_id || 0,
        wooOrder.date_created, // Customer createdAt = first order date
      );

      if (customer && customer._id) {
        localCustomerId = customer._id;
        this.logger.debug(
          `Order ${wooOrder.id}: linked to customer ${customer._id}`,
        );

        // Create/link phone record if phone number exists
        if (wooOrder.billing?.phone) {
          try {
            await this.phoneService.findOrCreate(
              storeId,
              wooOrder.billing.phone,
              customer._id.toString(),
              'order',
              String(wooOrder.id),
            );
          } catch (phoneError) {
            this.logger.warn(
              `Failed to create phone record for order ${wooOrder.id}: ${phoneError.message}`,
            );
          }
        }

        // Create/link email record if email exists
        if (wooOrder.billing?.email) {
          try {
            await this.emailService.findOrCreate(
              storeId,
              wooOrder.billing.email,
              customer._id.toString(),
              'order',
              String(wooOrder.id),
            );
          } catch (emailError) {
            this.logger.warn(
              `Failed to create email record for order ${wooOrder.id}: ${emailError.message}`,
            );
          }
        }
      } else {
        this.logger.warn(
          `Order ${wooOrder.id}: No customer created (missing phone number)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create/update customer for order ${wooOrder.id}: ${error.message}`,
        error.stack,
      );
    }

    // Add local customer reference to order data
    if (localCustomerId) {
      orderData['localCustomerId'] = localCustomerId;
    }

    if (existingOrder) {
      // Preserve internal fields
      orderData['trackingNumber'] = existingOrder.trackingNumber;
      orderData['trackingCarrier'] = existingOrder.trackingCarrier;
      orderData['trackingUrl'] = existingOrder.trackingUrl;
      orderData['internalNotes'] = existingOrder.internalNotes;
      orderData['notes'] = existingOrder.notes;
      orderData['tags'] = existingOrder.tags;
      // Preserve existing local customer if already set
      if (!localCustomerId && existingOrder.localCustomerId) {
        orderData['localCustomerId'] = existingOrder.localCustomerId;
      }
      // Preserve conversion data if not in this sync (e.g. meta_data stripped)
      if (!orderData.paidCurrency && existingOrder.paidCurrency) {
        orderData.paidCurrency = existingOrder.paidCurrency;
        orderData.paidTotal = existingOrder.paidTotal;
        orderData.conversionRate = existingOrder.conversionRate;
      }

      Object.assign(existingOrder, orderData);
      await existingOrder.save();

      // Check if stock should be fulfilled for this order
      await this.fulfillWooOrderStock(existingOrder);

      return existingOrder;
    }

    const newOrder = await this.orderModel.create(orderData);

    // Check if stock should be fulfilled for this order
    await this.fulfillWooOrderStock(newOrder);

    return newOrder;
  }

  /**
   * Fulfill stock for WooCommerce orders
   * Marks ProductUnits as sold when order status is processing/completed
   */
  private async fulfillWooOrderStock(order: OrderDocument): Promise<void> {
    // Only fulfill stock for processing or completed orders
    const fulfillStatuses = ['processing', 'completed'];
    if (!fulfillStatuses.includes(order.status)) {
      return;
    }

    // Skip if already fulfilled
    if (order.fulfillmentStatus === FulfillmentStatus.FULFILLED) {
      return;
    }

    // Skip if no line items
    if (!order.lineItems || order.lineItems.length === 0) {
      return;
    }

    try {
      const warnings: string[] = [];

      // Try to fulfill each line item
      for (const item of order.lineItems) {
        if (!item.sku || item.quantity <= 0) {
          continue;
        }

        try {
          // Use OrderItemService to fulfill stock for this line item
          const result = await this.orderItemService.fulfillWooLineItem(
            order.storeId.toString(),
            order._id.toString(),
            order.orderNumber,
            item.sku,
            item.quantity,
          );

          if (result.warning) {
            warnings.push(result.warning);
          }
        } catch (err) {
          this.logger.warn(
            `Failed to fulfill line item ${item.sku} for order ${order.orderNumber}: ${err.message}`,
          );
          warnings.push(`${item.sku}: ${err.message}`);
        }
      }

      // Update fulfillment status
      order.fulfillmentStatus =
        warnings.length > 0
          ? FulfillmentStatus.PARTIALLY_FULFILLED
          : FulfillmentStatus.FULFILLED;
      await order.save();

      if (warnings.length > 0) {
        this.logger.warn(
          `WooCommerce order ${
            order.orderNumber
          } partially fulfilled: ${warnings.join(', ')}`,
        );
      } else {
        this.logger.log(
          `WooCommerce order ${order.orderNumber} stock fulfilled successfully`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to fulfill WooCommerce order ${order.orderNumber}: ${error.message}`,
      );
    }
  }

  /**
   * Generate print data for order (packing slip)
   */
  async getPrintData(
    id: string,
    userId: string,
  ): Promise<{
    order: IOrder;
    store: any;
    printedAt: Date;
  }> {
    const order = await this.findById(id, userId);

    // Get store info
    const store = await this.storeModel.findById(order.storeId);

    return {
      order,
      store: store
        ? {
            name: store.name,
            url: store.url,
            address: store.settings?.storeAddress || '',
            phone: store.settings?.storePhone || '',
            email: store.settings?.storeEmail || '',
          }
        : null,
      printedAt: new Date(),
    };
  }

  /**
   * Create a refund for an order
   */
  async createRefund(
    id: string,
    userId: string,
    dto: {
      amount: string;
      reason?: string;
      syncToStore?: boolean;
      apiRefund?: boolean;
    },
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    // Validate refund amount
    const refundAmount = parseFloat(dto.amount);
    const orderTotal = parseFloat(order.total);
    const existingRefunds = (order.refunds || []).reduce(
      (sum, r) => sum + parseFloat(r.total || '0'),
      0,
    );
    const maxRefundable = orderTotal - existingRefunds;

    if (refundAmount <= 0) {
      throw new ForbiddenException('Refund amount must be greater than 0');
    }

    if (refundAmount > maxRefundable) {
      throw new ForbiddenException(
        `Refund amount exceeds maximum refundable amount of ${maxRefundable.toFixed(
          2,
        )}`,
      );
    }

    let wooRefundId: number | undefined;

    // Sync to WooCommerce if requested
    if (dto.syncToStore !== false && order.externalId) {
      try {
        const store = await this.storeModel
          .findById(order.storeId)
          .select('+credentials');
        if (store?.credentials) {
          const credentials = {
            url: store.url,
            consumerKey: store.credentials.consumerKey,
            consumerSecret: store.credentials.consumerSecret,
          };

          // Convert refund amount to payment currency if order was converted
          let wooRefundAmount = dto.amount;
          if (order.conversionRate && order.paidCurrency) {
            const converted = parseFloat(dto.amount) * order.conversionRate;
            // Cap at paidTotal to avoid rounding exceeding WooCommerce order total
            const paidTotal = parseFloat(order.paidTotal || '0');
            const existingWooRefunds = (order.refunds || []).reduce(
              (sum, r) =>
                sum + parseFloat(r.total || '0') * order.conversionRate,
              0,
            );
            const maxWooRefundable = paidTotal - existingWooRefunds;
            wooRefundAmount = Math.min(converted, maxWooRefundable).toFixed(2);
          }

          this.logger.log(
            `Creating WooCommerce refund: order=${order.externalId}, amount=${wooRefundAmount}, ` +
            `originalAmount=${dto.amount}, conversionRate=${order.conversionRate}, ` +
            `paidTotal=${order.paidTotal}, paidCurrency=${order.paidCurrency}, api_refund=${dto.apiRefund}`,
          );

          const wooRefund = await this.wooCommerceService.createRefund(
            credentials,
            order.externalId,
            {
              amount: wooRefundAmount,
              reason: dto.reason,
              api_refund: dto.apiRefund ?? false,
            },
          );

          wooRefundId = wooRefund.id;
          this.logger.log(
            `Refund ${wooRefund.id} created in WooCommerce for order ${order.externalId}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to create refund in WooCommerce: ${error.message}`,
        );
        throw new ForbiddenException(
          `Failed to create refund in WooCommerce: ${error.message}`,
        );
      }
    }

    // Add refund to local order
    const refund = {
      externalId: wooRefundId,
      reason: dto.reason || '',
      total: dto.amount,
      refundedAt: new Date(),
    };

    order.refunds = [...(order.refunds || []), refund];

    // Update payment status if fully refunded
    if (refundAmount + existingRefunds >= orderTotal) {
      order.paymentStatus = 'refunded' as any;
    } else {
      order.paymentStatus = 'partial-refund' as any;
    }

    await order.save();
    return this.toInterface(order);
  }

  /**
   * Get refunds for an order
   */
  async getRefunds(
    id: string,
    userId: string,
  ): Promise<
    Array<{
      externalId?: number;
      reason?: string;
      total: string;
      refundedAt: Date;
    }>
  > {
    const order = await this.findById(id, userId);
    return order.refunds || [];
  }

  // ========================
  // Manual Order Methods
  // ========================

  /**
   * Generate internal order number for manual orders
   * Format: CF-{storePrefix}-{timestamp}-{sequence}
   */
  private async generateInternalOrderNumber(storeId: string): Promise<string> {
    const storePrefix = storeId.substring(0, 4).toUpperCase();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of manual orders for this store today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await this.orderModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      source: OrderSource.MANUAL,
      createdAt: { $gte: startOfDay },
    });

    const sequence = (count + 1).toString().padStart(4, '0');
    return `CF-${storePrefix}-${dateStr}-${sequence}`;
  }

  /**
   * Create a manual order (draft status)
   */
  async createManualOrder(
    storeId: string,
    userId: string,
    dto: ICreateManualOrderDto,
  ): Promise<IOrder> {
    await this.verifyStoreAccess(storeId, userId);

    const internalOrderNumber = await this.generateInternalOrderNumber(storeId);

    const now = new Date();
    const order = new this.orderModel({
      storeId: new Types.ObjectId(storeId),
      orderNumber: internalOrderNumber,
      internalOrderNumber,
      source: OrderSource.MANUAL,
      useSeparateItems: true,
      status: OrderStatus.DRAFT,
      paymentStatus: dto.paymentStatus || PaymentStatus.PENDING,
      fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
      currency: dto.currency || 'EGP',
      total: '0',
      discountTotal: '0',
      shippingTotal: dto.shippingTotal || '0',
      billing: dto.billing || {},
      shipping: dto.shipping || dto.billing || {},
      customerNote: dto.customerNote,
      internalNotes: dto.internalNotes,
      createdByUserId: new Types.ObjectId(userId),
      createdVia: 'cartflow',
      itemsCount: 0,
      itemsQuantity: 0,
      itemsSubtotal: 0,
      isDeleted: false,
      // Set dateCreatedWoo for consistent sorting with WooCommerce orders
      dateCreatedWoo: now,
    });

    // Link to customer if provided
    if (dto.customerId) {
      (order as any).localCustomerId = new Types.ObjectId(dto.customerId);
    }

    await order.save();

    this.logger.log(
      `Manual order ${internalOrderNumber} created by user ${userId}`,
    );
    return this.toInterface(order);
  }

  /**
   * Confirm a manual order - deducts stock
   */
  async confirmOrder(orderId: string, userId: string): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    if (order.source !== OrderSource.MANUAL) {
      throw new ForbiddenException('Only manual orders can be confirmed');
    }

    if (order.status !== OrderStatus.DRAFT) {
      throw new ForbiddenException('Only draft orders can be confirmed');
    }

    // Check if order has items
    const orderItems = await this.orderItemService.getOrderItems(orderId);
    if (orderItems.length === 0) {
      throw new ForbiddenException(
        'Cannot confirm an order with no items. Please add items first.',
      );
    }

    // Fulfill order items (deduct stock)
    const fulfillResult = await this.orderItemService.fulfillOrderItems(
      orderId,
      order.orderNumber,
    );

    // Update order status
    order.status = OrderStatus.CONFIRMED;
    order.confirmedAt = new Date();

    // Update fulfillment status based on result
    if (fulfillResult.warnings.length === 0) {
      order.fulfillmentStatus = FulfillmentStatus.FULFILLED;
    } else {
      order.fulfillmentStatus = FulfillmentStatus.PARTIALLY_FULFILLED;
    }

    // Recalculate totals
    const totals = await this.orderItemService.getOrderTotals(orderId);
    order.itemsCount = totals.itemsCount;
    order.itemsQuantity = totals.itemsQuantity;
    order.itemsSubtotal = totals.itemsSubtotal;
    order.total = (
      totals.itemsTotal + parseFloat(order.shippingTotal || '0')
    ).toString();

    await order.save();

    this.logger.log(
      `Order ${order.orderNumber} confirmed: ${fulfillResult.fulfilledItems} items, ${fulfillResult.totalUnitsAssigned} units`,
    );

    return this.toInterface(order);
  }

  /**
   * Cancel an order - restores stock if confirmed
   */
  async cancelOrder(
    orderId: string,
    userId: string,
    reason?: string,
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    // Only manual orders can be cancelled this way
    if (order.source !== OrderSource.MANUAL) {
      throw new ForbiddenException('Use status update for WooCommerce orders');
    }

    const wasConfirmed =
      order.status === OrderStatus.CONFIRMED ||
      order.status === OrderStatus.PROCESSING ||
      order.status === OrderStatus.SHIPPED;

    // Release stock if order was confirmed
    if (wasConfirmed && order.useSeparateItems) {
      const releasedUnits = await this.orderItemService.releaseOrderUnits(
        orderId,
      );
      this.logger.log(
        `Released ${releasedUnits} units for cancelled order ${order.orderNumber}`,
      );
    }

    // Cancel pending items
    if (order.useSeparateItems) {
      await this.orderItemService.cancelOrderItems(orderId);
    }

    // Update order status
    order.status = OrderStatus.CANCELLED;

    if (reason) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\nCancellation reason: ${reason}`
        : `Cancellation reason: ${reason}`;
    }

    await order.save();

    this.logger.log(`Order ${order.orderNumber} cancelled by user ${userId}`);
    return this.toInterface(order);
  }

  /**
   * Transition order status with validation
   */
  async transitionStatus(
    orderId: string,
    userId: string,
    newStatus: OrderStatus,
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(order.storeId.toString(), userId);

    const currentStatus = order.status;

    // Define valid transitions
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.PENDING]: [
        OrderStatus.PROCESSING,
        OrderStatus.ON_HOLD,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [
        OrderStatus.SHIPPED,
        OrderStatus.ON_HOLD,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.ON_HOLD]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
      [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED, OrderStatus.REFUNDED],
      [OrderStatus.COMPLETED]: [OrderStatus.REFUNDED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.REFUNDED]: [],
      [OrderStatus.FAILED]: [OrderStatus.PENDING],
      [OrderStatus.TRASH]: [],
    };

    const allowedTransitions = validTransitions[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ForbiddenException(
        `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${
          allowedTransitions.join(', ') || 'none'
        }`,
      );
    }

    // Update timestamps based on status
    order.status = newStatus;

    if (newStatus === OrderStatus.SHIPPED) {
      order.shippedAt = new Date();
      order.fulfillmentStatus = FulfillmentStatus.SHIPPED;
    } else if (newStatus === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
      order.fulfillmentStatus = FulfillmentStatus.DELIVERED;
    } else if (newStatus === OrderStatus.COMPLETED) {
      order.dateCompleted = new Date();
      order.fulfillmentStatus = FulfillmentStatus.DELIVERED;
    }

    await order.save();

    // Sync to WooCommerce if not a manual order
    if (order.source === OrderSource.WOOCOMMERCE && order.externalId) {
      try {
        await this.syncOrderStatusToWoo(order);
      } catch (error) {
        this.logger.error(
          `Failed to sync status to WooCommerce: ${error.message}`,
        );
      }
    }

    // Schedule review request when order is delivered or completed
    if (
      newStatus === OrderStatus.DELIVERED ||
      newStatus === OrderStatus.COMPLETED
    ) {
      try {
        await this.reviewRequestService.scheduleRequest(
          order._id.toString(),
          newStatus,
        );
      } catch (error) {
        this.logger.error(
          `Failed to schedule review request: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Order ${order.orderNumber} transitioned from ${currentStatus} to ${newStatus}`,
    );
    return this.toInterface(order);
  }

  /**
   * Clone an order (for reordering)
   */
  async cloneOrder(orderId: string, userId: string): Promise<IOrder> {
    const originalOrder = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      isDeleted: false,
    });

    if (!originalOrder) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyStoreAccess(originalOrder.storeId.toString(), userId);

    // Create new order as draft
    const newOrder = await this.createManualOrder(
      originalOrder.storeId.toString(),
      userId,
      {
        currency: originalOrder.currency,
        billing: originalOrder.billing,
        shipping: originalOrder.shipping,
        shippingTotal: originalOrder.shippingTotal,
        customerId: originalOrder.localCustomerId?.toString(),
        customerNote: originalOrder.customerNote,
      },
    );

    // Clone order items if using separate items
    if (originalOrder.useSeparateItems) {
      const originalItems = await this.orderItemService.getOrderItems(orderId);

      if (originalItems.length > 0) {
        await this.orderItemService.addItemsBulk({
          storeId: originalOrder.storeId.toString(),
          orderId: newOrder._id,
          items: originalItems.map((item) => ({
            productId: item.productId?.toString(),
            variantId: item.variantId?.toString(),
            skuId: item.skuId?.toString(),
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            attributes: item.attributes,
          })),
        });
      }
    }

    this.logger.log(
      `Order ${originalOrder.orderNumber} cloned to ${newOrder.orderNumber}`,
    );
    return this.findById(newOrder._id, userId);
  }

  // ========================
  // WooCommerce Batch Operations
  // ========================

  /**
   * Map CartFlow status to valid WooCommerce status
   * WooCommerce only supports: pending, processing, on-hold, completed, cancelled, refunded, failed, trash
   */
  private mapToWooCommerceStatus(status: string): string {
    const statusMap: Record<string, string> = {
      // Direct mappings
      pending: 'pending',
      processing: 'processing',
      'on-hold': 'on-hold',
      completed: 'completed',
      cancelled: 'cancelled',
      refunded: 'refunded',
      failed: 'failed',
      trash: 'trash',
      // CartFlow-specific mappings
      draft: 'pending', // Draft → Pending
      confirmed: 'processing', // Confirmed → Processing
      shipped: 'completed', // Shipped → Completed (WooCommerce has no shipped status)
      delivered: 'completed', // Delivered → Completed
    };
    return statusMap[status] || 'processing';
  }

  /**
   * Batch create, update, and delete orders in WooCommerce
   * This is a direct pass-through to WooCommerce's batch API
   */
  async batchOrders(
    userId: string,
    dto: BatchOrdersDto,
  ): Promise<{
    create?: {
      success: IOrder[];
      failed: Array<{ index: number; error: string }>;
    };
    update?: {
      success: IOrder[];
      failed: Array<{ id: number; error: string }>;
    };
    delete?: {
      success: IOrder[];
      failed: Array<{ id: number; error: string }>;
    };
  }> {
    const store = await this.verifyStoreAccess(dto.storeId, userId, true);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    const result: {
      create?: {
        success: IOrder[];
        failed: Array<{ index: number; error: string }>;
      };
      update?: {
        success: IOrder[];
        failed: Array<{ id: number; error: string }>;
      };
      delete?: {
        success: IOrder[];
        failed: Array<{ id: number; error: string }>;
      };
    } = {};

    try {
      // Map CartFlow statuses to WooCommerce statuses
      const mappedCreate = dto.create?.map((order) => ({
        ...order,
        status: order.status
          ? this.mapToWooCommerceStatus(order.status)
          : undefined,
      }));

      const mappedUpdate = dto.update?.map((order) => ({
        ...order,
        status: order.status
          ? this.mapToWooCommerceStatus(order.status)
          : undefined,
      }));

      // Call WooCommerce batch API
      const wooResponse = await this.wooCommerceService.batchOrders(
        credentials,
        {
          create: mappedCreate,
          update: mappedUpdate,
          delete: dto.delete,
        },
      );

      // Process created orders
      if (wooResponse.create && wooResponse.create.length > 0) {
        result.create = { success: [], failed: [] };
        for (let i = 0; i < wooResponse.create.length; i++) {
          const wooOrder = wooResponse.create[i];
          try {
            // Upsert created order to local database
            const localOrder = await this.upsertFromWoo(dto.storeId, wooOrder);
            result.create.success.push(this.toInterface(localOrder));
          } catch (error) {
            result.create.failed.push({ index: i, error: error.message });
            this.logger.error(
              `Failed to save created order ${wooOrder.id} locally: ${error.message}`,
            );
          }
        }
      }

      // Process updated orders
      if (wooResponse.update && wooResponse.update.length > 0) {
        result.update = { success: [], failed: [] };
        for (const wooOrder of wooResponse.update) {
          try {
            // Upsert updated order to local database
            const localOrder = await this.upsertFromWoo(dto.storeId, wooOrder);
            result.update.success.push(this.toInterface(localOrder));
          } catch (error) {
            result.update.failed.push({
              id: wooOrder.id,
              error: error.message,
            });
            this.logger.error(
              `Failed to update order ${wooOrder.id} locally: ${error.message}`,
            );
          }
        }
      }

      // Process deleted orders
      if (wooResponse.delete && wooResponse.delete.length > 0) {
        result.delete = { success: [], failed: [] };
        for (const wooOrder of wooResponse.delete) {
          try {
            // Mark order as deleted in local database
            const localOrder = await this.orderModel.findOne({
              storeId: new Types.ObjectId(dto.storeId),
              externalId: wooOrder.id,
            });
            if (localOrder) {
              localOrder.isDeleted = true;
              await localOrder.save();
              result.delete.success.push(this.toInterface(localOrder));
            } else {
              // Order not in local database, just report as success
              result.delete.success.push({
                _id: '',
                externalId: wooOrder.id,
              } as any);
            }
          } catch (error) {
            result.delete.failed.push({
              id: wooOrder.id,
              error: error.message,
            });
            this.logger.error(
              `Failed to delete order ${wooOrder.id} locally: ${error.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Batch orders completed: created=${
          result.create?.success.length || 0
        }, ` +
          `updated=${result.update?.success.length || 0}, deleted=${
            result.delete?.success.length || 0
          }`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Batch orders failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a single order in WooCommerce with full field support
   */
  async updateWooOrder(
    userId: string,
    storeId: string,
    wooOrderId: number,
    updateData: {
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
  ): Promise<IOrder> {
    const store = await this.verifyStoreAccess(storeId, userId, true);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    try {
      // Map status if provided
      const mappedData = {
        ...updateData,
        status: updateData.status
          ? this.mapToWooCommerceStatus(updateData.status)
          : undefined,
      };

      // Use batch API with single update
      const wooResponse = await this.wooCommerceService.batchOrders(
        credentials,
        {
          update: [{ id: wooOrderId, ...mappedData }],
        },
      );

      if (!wooResponse.update || wooResponse.update.length === 0) {
        throw new BadRequestException('Failed to update order in WooCommerce');
      }

      // Upsert to local database
      const localOrder = await this.upsertFromWoo(
        storeId,
        wooResponse.update[0],
      );

      // Also update CartFlow-specific status if different from WooCommerce
      if (updateData.status && updateData.status !== mappedData.status) {
        localOrder.status = updateData.status as any;
        await localOrder.save();
      }

      this.logger.log(
        `WooCommerce order ${wooOrderId} updated and synced locally`,
      );
      return this.toInterface(localOrder);
    } catch (error) {
      this.logger.error(
        `Failed to update WooCommerce order ${wooOrderId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Create a single order in WooCommerce and sync to local database
   */
  async createWooOrder(
    userId: string,
    storeId: string,
    orderData: BatchCreateOrderItemDto,
  ): Promise<IOrder> {
    const store = await this.verifyStoreAccess(storeId, userId, true);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    try {
      // Create order in WooCommerce
      const wooOrder = await this.wooCommerceService.createOrder(
        credentials,
        orderData,
      );

      // Upsert to local database
      const localOrder = await this.upsertFromWoo(storeId, wooOrder);

      this.logger.log(
        `WooCommerce order ${wooOrder.id} created and synced locally`,
      );
      return this.toInterface(localOrder);
    } catch (error) {
      this.logger.error(`Failed to create WooCommerce order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete an order from WooCommerce and mark as deleted locally
   */
  async deleteWooOrder(
    userId: string,
    storeId: string,
    wooOrderId: number,
    force = false,
  ): Promise<{ success: boolean; message: string }> {
    const store = await this.verifyStoreAccess(storeId, userId, true);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    try {
      // Delete from WooCommerce
      await this.wooCommerceService.deleteOrder(credentials, wooOrderId, force);

      // Mark as deleted locally
      const localOrder = await this.orderModel.findOne({
        storeId: new Types.ObjectId(storeId),
        externalId: wooOrderId,
      });

      if (localOrder) {
        localOrder.isDeleted = true;
        await localOrder.save();
      }

      this.logger.log(`WooCommerce order ${wooOrderId} deleted`);
      return {
        success: true,
        message: `Order ${wooOrderId} deleted successfully`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to delete WooCommerce order ${wooOrderId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Bulk delete orders from WooCommerce
   */
  async bulkDeleteWooOrders(
    userId: string,
    storeId: string,
    wooOrderIds: number[],
    force = false,
  ): Promise<{ deleted: number; failed: number; errors: string[] }> {
    const store = await this.verifyStoreAccess(storeId, userId, true);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      // Use batch API for deletion
      const wooResponse = await this.wooCommerceService.batchOrders(
        credentials,
        {
          delete: wooOrderIds,
        },
      );

      // Process deleted orders
      if (wooResponse.delete) {
        for (const wooOrder of wooResponse.delete) {
          try {
            const localOrder = await this.orderModel.findOne({
              storeId: new Types.ObjectId(storeId),
              externalId: wooOrder.id,
            });
            if (localOrder) {
              localOrder.isDeleted = true;
              await localOrder.save();
            }
            deleted++;
          } catch (error) {
            failed++;
            errors.push(`Order ${wooOrder.id}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Bulk delete failed: ${error.message}`);
      failed = wooOrderIds.length;
      errors.push(error.message);
    }

    this.logger.log(`Bulk delete orders: ${deleted} deleted, ${failed} failed`);
    return { deleted, failed, errors };
  }

  private toInterface(doc: OrderDocument): IOrder {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      externalId: obj.externalId,
      orderNumber: obj.orderNumber,
      internalOrderNumber: obj.internalOrderNumber,
      orderKey: obj.orderKey,
      source: obj.source,
      useSeparateItems: obj.useSeparateItems,
      status: obj.status,
      paymentStatus: obj.paymentStatus,
      fulfillmentStatus: obj.fulfillmentStatus,
      currency: obj.currency,
      currencySymbol: obj.currencySymbol,
      paidCurrency: obj.paidCurrency,
      paidTotal: obj.paidTotal,
      conversionRate: obj.conversionRate,
      pricesIncludeTax: obj.pricesIncludeTax,
      discountTotal: obj.discountTotal,
      discountTax: obj.discountTax,
      shippingTotal: obj.shippingTotal,
      shippingTax: obj.shippingTax,
      cartTax: obj.cartTax,
      total: obj.total,
      totalTax: obj.totalTax,
      itemsCount: obj.itemsCount,
      itemsQuantity: obj.itemsQuantity,
      itemsSubtotal: obj.itemsSubtotal,
      customerId: obj.customerId,
      localCustomerId: obj.localCustomerId?.toString(),
      customerNote: obj.customerNote,
      billing: obj.billing,
      shipping: obj.shipping,
      paymentMethod: obj.paymentMethod,
      paymentMethodTitle: obj.paymentMethodTitle,
      transactionId: obj.transactionId,
      datePaid: obj.datePaid,
      dateCompleted: obj.dateCompleted,
      confirmedAt: obj.confirmedAt,
      shippedAt: obj.shippedAt,
      deliveredAt: obj.deliveredAt,
      createdByUserId: obj.createdByUserId?.toString(),
      lineItems: obj.lineItems,
      shippingLines: obj.shippingLines,
      feeLines: obj.feeLines,
      couponLines: obj.couponLines,
      refunds: obj.refunds,
      createdVia: obj.createdVia,
      dateCreatedWoo: obj.dateCreatedWoo,
      dateModifiedWoo: obj.dateModifiedWoo,
      lastSyncedAt: obj.lastSyncedAt,
      trackingNumber: obj.trackingNumber,
      trackingCarrier: obj.trackingCarrier,
      trackingUrl: obj.trackingUrl,
      internalNotes: obj.internalNotes,
      notes: (obj.notes || []).map((n: any) => ({
        _id: n._id.toString(),
        content: n.content,
        isCustomerNote: n.isCustomerNote,
        addedBy: n.addedBy,
        addedByUserId: n.addedByUserId?.toString(),
        createdAt: n.createdAt,
      })),
      tags: obj.tags,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
