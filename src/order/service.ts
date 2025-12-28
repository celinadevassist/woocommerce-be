import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schema';
import { UpdateOrderDto, AddTrackingDto, AddOrderNoteDto } from './dto.update';
import { QueryOrderDto } from './dto.query';
import { IOrder, IOrderResponse, IOrderStats } from './interface';
import { OrderStatus, PaymentStatus, FulfillmentStatus } from './enum';
import { Organization, OrganizationDocument } from '../organization/schema';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooOrder } from '../integrations/woocommerce/woocommerce.types';
import { CustomerService } from '../customer/service';
import { PhoneService } from '../phone/service';
import { EmailService } from '../email/service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly wooCommerceService: WooCommerceService,
    @Inject(forwardRef(() => CustomerService))
    private readonly customerService: CustomerService,
    @Inject(forwardRef(() => PhoneService))
    private readonly phoneService: PhoneService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
  ) {}

  /**
   * Get orders with filtering and pagination
   */
  async findAll(userId: string, query: QueryOrderDto): Promise<IOrderResponse> {
    const organizations = await this.getUserOrganizations(userId);
    const orgIds = organizations.map((org) => org._id);

    const filter: any = {
      organizationId: { $in: orgIds },
      isDeleted: false,
    };

    // Apply filters
    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.organizationId) {
      filter.organizationId = new Types.ObjectId(query.organizationId);
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
      if (query.startDate) filter.dateCreatedWoo.$gte = new Date(query.startDate);
      if (query.endDate) filter.dateCreatedWoo.$lte = new Date(query.endDate);
    }
    if (query.minTotal !== undefined || query.maxTotal !== undefined) {
      filter.$expr = { $and: [] };
      if (query.minTotal !== undefined) {
        filter.$expr.$and.push({ $gte: [{ $toDouble: '$total' }, query.minTotal] });
      }
      if (query.maxTotal !== undefined) {
        filter.$expr.$and.push({ $lte: [{ $toDouble: '$total' }, query.maxTotal] });
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

    await this.verifyOrganizationAccess(order.organizationId.toString(), userId);

    return this.toInterface(order);
  }

  /**
   * Update order (status, fulfillment, tracking, notes)
   * Optionally syncs status changes back to WooCommerce
   */
  async update(id: string, userId: string, dto: UpdateOrderDto): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyOrganizationAccess(order.organizationId.toString(), userId);

    const oldStatus = order.status;
    const statusChanged = dto.status && dto.status !== oldStatus;

    // Update fields
    if (dto.status) order.status = dto.status;
    if (dto.fulfillmentStatus) order.fulfillmentStatus = dto.fulfillmentStatus;
    if (dto.trackingNumber) order.trackingNumber = dto.trackingNumber;
    if (dto.trackingCarrier) order.trackingCarrier = dto.trackingCarrier;
    if (dto.trackingUrl) order.trackingUrl = dto.trackingUrl;
    if (dto.internalNotes !== undefined) order.internalNotes = dto.internalNotes;
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
        this.logger.log(`Order ${order.orderNumber} status synced to WooCommerce: ${dto.status}`);
      } catch (error) {
        this.logger.error(`Failed to sync order status to WooCommerce: ${error.message}`);
        // Don't throw - local update succeeded, just log the sync failure
      }
    }

    return this.toInterface(order);
  }

  /**
   * Sync order status to WooCommerce
   */
  private async syncOrderStatusToWoo(order: OrderDocument): Promise<void> {
    const store = await this.storeModel.findById(order.storeId);
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
  async addTracking(id: string, userId: string, dto: AddTrackingDto): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyOrganizationAccess(order.organizationId.toString(), userId);

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
    syncToStore: boolean = true,
  ): Promise<{ updated: number; failed: number; errors: string[] }> {
    const organizations = await this.getUserOrganizations(userId);
    const orgIds = organizations.map((org) => org._id);

    const orders = await this.orderModel.find({
      _id: { $in: orderIds.map((id) => new Types.ObjectId(id)) },
      organizationId: { $in: orgIds },
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
            this.logger.error(`Failed to sync order ${order.orderNumber} to WooCommerce: ${syncError.message}`);
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
  async addNote(id: string, userId: string, userName: string, dto: AddOrderNoteDto): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyOrganizationAccess(order.organizationId.toString(), userId);

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
  async deleteNote(id: string, noteId: string, userId: string): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyOrganizationAccess(order.organizationId.toString(), userId);

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
  async getStats(userId: string, storeId?: string, startDate?: Date, endDate?: Date): Promise<IOrderStats> {
    const organizations = await this.getUserOrganizations(userId);
    const orgIds = organizations.map((org) => org._id);

    const filter: any = {
      organizationId: { $in: orgIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }
    if (startDate || endDate) {
      filter.dateCreatedWoo = {};
      if (startDate) filter.dateCreatedWoo.$gte = startDate;
      if (endDate) filter.dateCreatedWoo.$lte = endDate;
    }

    const [totalOrders, revenueResult, statusCounts, recentOrders] = await Promise.all([
      this.orderModel.countDocuments(filter),
      this.orderModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $toDouble: '$total' } },
          },
        },
      ]),
      this.orderModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.orderModel.find(filter).sort({ dateCreatedWoo: -1 }).limit(5),
    ]);

    const totalRevenue = revenueResult[0]?.totalRevenue || 0;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const ordersByStatus: Record<OrderStatus, number> = {} as Record<OrderStatus, number>;
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
    const organizations = await this.getUserOrganizations(userId);
    const orgIds = organizations.map((org) => org._id);

    const filter: any = {
      organizationId: { $in: orgIds },
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
      if (query.startDate) filter.dateCreatedWoo.$gte = new Date(query.startDate);
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
        order.dateCreatedWoo ? new Date(order.dateCreatedWoo).toISOString().split('T')[0] : '',
        `${order.billing?.firstName || ''} ${order.billing?.lastName || ''}`.trim(),
        order.billing?.email || '',
        order.billing?.phone || '',
        billingAddress,
        shippingAddress,
        order.lineItems?.length || 0,
        parseFloat(order.total || '0') - parseFloat(order.shippingTotal || '0') - parseFloat(order.discountTotal || '0'),
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
    const csvContent = BOM + [
      headers.map(escapeValue).join(','),
      ...rows.map((row) => row.map(escapeValue).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Upsert order from WooCommerce data (used during sync)
   */
  async upsertFromWoo(
    storeId: string,
    organizationId: string,
    wooOrder: WooOrder,
  ): Promise<OrderDocument> {
    const existingOrder = await this.orderModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: wooOrder.id,
    });

    const orderData: any = {
      storeId: new Types.ObjectId(storeId),
      organizationId: new Types.ObjectId(organizationId),
      externalId: wooOrder.id,
      orderNumber: wooOrder.number,
      orderKey: wooOrder.order_key,
      status: wooOrder.status as OrderStatus,
      paymentStatus: wooOrder.date_paid ? PaymentStatus.PAID : PaymentStatus.PENDING,
      fulfillmentStatus: wooOrder.status === 'completed' ? FulfillmentStatus.DELIVERED : FulfillmentStatus.UNFULFILLED,
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
      dateCompleted: wooOrder.date_completed ? new Date(wooOrder.date_completed) : undefined,
      lineItems: wooOrder.line_items.map((item) => ({
        externalId: item.id,
        name: item.name,
        productId: item.product_id,
        variationId: item.variation_id,
        quantity: item.quantity,
        sku: item.sku,
        price: item.price,
        subtotal: item.subtotal,
        subtotalTax: item.subtotal_tax,
        total: item.total,
        totalTax: item.total_tax,
        taxClass: item.tax_class,
      })),
      shippingLines: wooOrder.shipping_lines?.map((line) => ({
        externalId: line.id,
        methodTitle: line.method_title,
        methodId: line.method_id,
        total: line.total,
        totalTax: line.total_tax,
      })) || [],
      feeLines: wooOrder.fee_lines?.map((line) => ({
        externalId: line.id,
        name: line.name,
        total: line.total,
        totalTax: line.total_tax,
      })) || [],
      couponLines: wooOrder.coupon_lines?.map((line) => ({
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

    // Find or create customer from order billing info (every order must have a customer)
    let localCustomerId: Types.ObjectId | undefined;
    try {
      const customer = await this.customerService.findOrCreateFromOrder(
        storeId,
        organizationId,
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
        this.logger.debug(`Order ${wooOrder.id}: linked to customer ${customer._id}`);

        // Note: Customer stats are now calculated dynamically from orders, no need to update here

        // Create/link phone record if phone number exists
        if (wooOrder.billing?.phone) {
          try {
            await this.phoneService.findOrCreate(
              storeId,
              organizationId,
              wooOrder.billing.phone,
              customer._id.toString(),
              'order',
              String(wooOrder.id),
            );
          } catch (phoneError) {
            this.logger.warn(`Failed to create phone record for order ${wooOrder.id}: ${phoneError.message}`);
          }
        }

        // Create/link email record if email exists
        if (wooOrder.billing?.email) {
          try {
            await this.emailService.findOrCreate(
              storeId,
              organizationId,
              wooOrder.billing.email,
              customer._id.toString(),
              'order',
              String(wooOrder.id),
            );
          } catch (emailError) {
            this.logger.warn(`Failed to create email record for order ${wooOrder.id}: ${emailError.message}`);
          }
        }
      } else {
        this.logger.warn(`Order ${wooOrder.id}: No customer created (missing phone number)`);
      }
    } catch (error) {
      this.logger.error(`Failed to create/update customer for order ${wooOrder.id}: ${error.message}`, error.stack);
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

      Object.assign(existingOrder, orderData);
      await existingOrder.save();
      return existingOrder;
    }

    return await this.orderModel.create(orderData);
  }

  /**
   * Generate print data for order (packing slip)
   */
  async getPrintData(id: string, userId: string): Promise<{
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
    dto: { amount: string; reason?: string; syncToStore?: boolean; apiRefund?: boolean },
  ): Promise<IOrder> {
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.verifyOrganizationAccess(order.organizationId.toString(), userId);

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
        `Refund amount exceeds maximum refundable amount of ${maxRefundable.toFixed(2)}`,
      );
    }

    let wooRefundId: number | undefined;

    // Sync to WooCommerce if requested
    if (dto.syncToStore !== false && order.externalId) {
      try {
        const store = await this.storeModel.findById(order.storeId);
        if (store) {
          const credentials = {
            url: store.url,
            consumerKey: store.credentials.consumerKey,
            consumerSecret: store.credentials.consumerSecret,
          };

          const wooRefund = await this.wooCommerceService.createRefund(
            credentials,
            order.externalId,
            {
              amount: dto.amount,
              reason: dto.reason,
              api_refund: dto.apiRefund ?? false,
            },
          );

          wooRefundId = wooRefund.id;
          this.logger.log(`Refund ${wooRefund.id} created in WooCommerce for order ${order.externalId}`);
        }
      } catch (error) {
        this.logger.error(`Failed to create refund in WooCommerce: ${error.message}`);
        throw new ForbiddenException(`Failed to create refund in WooCommerce: ${error.message}`);
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
  async getRefunds(id: string, userId: string): Promise<Array<{ externalId?: number; reason?: string; total: string; refundedAt: Date }>> {
    const order = await this.findById(id, userId);
    return order.refunds || [];
  }

  // Helper methods
  private async getUserOrganizations(userId: string): Promise<OrganizationDocument[]> {
    return this.organizationModel.find({
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });
  }

  private async verifyOrganizationAccess(organizationId: string, userId: string): Promise<void> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const isOwner = organization.ownerId.toString() === userId;
    const isMember = organization.members.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this organization');
    }
  }

  private toInterface(doc: OrderDocument): IOrder {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      organizationId: obj.organizationId.toString(),
      externalId: obj.externalId,
      orderNumber: obj.orderNumber,
      orderKey: obj.orderKey,
      status: obj.status,
      paymentStatus: obj.paymentStatus,
      fulfillmentStatus: obj.fulfillmentStatus,
      currency: obj.currency,
      currencySymbol: obj.currencySymbol,
      pricesIncludeTax: obj.pricesIncludeTax,
      discountTotal: obj.discountTotal,
      discountTax: obj.discountTax,
      shippingTotal: obj.shippingTotal,
      shippingTax: obj.shippingTax,
      cartTax: obj.cartTax,
      total: obj.total,
      totalTax: obj.totalTax,
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
