import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
} from './schema';
import { STORE_PRICE_PER_MONTH, BILLING_CYCLE_DAYS } from '../organization/enum';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {}

  /**
   * Create a subscription for a new store
   * Called when a store is created
   */
  async createSubscription(
    storeId: string,
    organizationId: string,
    storeName?: string,
    storeUrl?: string,
  ): Promise<SubscriptionDocument> {
    const now = new Date();
    const nextInvoiceDate = new Date(now);
    nextInvoiceDate.setDate(nextInvoiceDate.getDate() + BILLING_CYCLE_DAYS);

    const subscription = await this.subscriptionModel.create({
      storeId: new Types.ObjectId(storeId),
      organizationId: new Types.ObjectId(organizationId),
      status: SubscriptionStatus.ACTIVE,
      pricePerMonth: STORE_PRICE_PER_MONTH,
      currency: 'USD',
      billingCycleStart: now,
      nextInvoiceDate: nextInvoiceDate,
    });

    this.logger.log(`Created subscription for store ${storeId}, next invoice: ${nextInvoiceDate}`);
    return subscription;
  }

  /**
   * Get subscription by store ID
   */
  async getByStoreId(storeId: string): Promise<SubscriptionDocument | null> {
    return this.subscriptionModel.findOne({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  /**
   * Get all subscriptions for an organization
   */
  async getByOrganizationId(organizationId: string): Promise<SubscriptionDocument[]> {
    return this.subscriptionModel.find({
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    }).sort({ createdAt: -1 });
  }

  /**
   * Check if a store subscription is active (not suspended)
   * Returns true if store can be used, false if blocked
   * Store is blocked when there's any pending/overdue invoice
   */
  async isStoreActive(storeId: string): Promise<{ active: boolean; reason?: string; invoice?: InvoiceDocument }> {
    const subscription = await this.getByStoreId(storeId);

    if (!subscription) {
      // No subscription found - allow access (new store, subscription not yet created)
      return { active: true };
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      return {
        active: false,
        reason: 'Subscription has been cancelled',
      };
    }

    // Check for any unpaid invoice (pending or overdue)
    const unpaidInvoice = await this.invoiceModel.findOne({
      storeId: new Types.ObjectId(storeId),
      status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
      isDeleted: false,
    }).sort({ createdAt: -1 });

    if (unpaidInvoice) {
      return {
        active: false,
        reason: `Invoice ${unpaidInvoice.invoiceNumber} requires payment to continue using this store`,
        invoice: unpaidInvoice,
      };
    }

    return { active: true };
  }

  /**
   * Generate invoice for a subscription
   * Store will be blocked immediately until invoice is paid
   */
  async generateInvoice(subscription: SubscriptionDocument, storeName?: string, storeUrl?: string, organizationName?: string): Promise<InvoiceDocument> {
    const now = new Date();
    const periodStart = subscription.billingCycleStart;
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + BILLING_CYCLE_DAYS);

    // Generate invoice number: INV-YYYY-NNNNN
    const year = now.getFullYear();
    const count = await this.invoiceModel.countDocuments({
      invoiceNumber: { $regex: `^INV-${year}-` },
    });
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;

    // Due date is immediate - no grace period, store is blocked until paid
    const dueDate = now;

    const invoice = await this.invoiceModel.create({
      invoiceNumber,
      storeId: subscription.storeId,
      organizationId: subscription.organizationId,
      subscriptionId: subscription._id,
      status: InvoiceStatus.PENDING,
      periodStart,
      periodEnd,
      amount: subscription.pricePerMonth,
      currency: subscription.currency,
      dueDate,
      storeName,
      storeUrl,
      organizationName,
    });

    // Update subscription with new billing cycle
    subscription.lastInvoiceDate = now;
    subscription.billingCycleStart = periodEnd;
    subscription.nextInvoiceDate = new Date(periodEnd);
    subscription.nextInvoiceDate.setDate(subscription.nextInvoiceDate.getDate() + BILLING_CYCLE_DAYS);
    await subscription.save();

    this.logger.log(`Generated invoice ${invoiceNumber} for store ${subscription.storeId}, amount: $${subscription.pricePerMonth}. Store blocked until payment.`);
    return invoice;
  }

  /**
   * Mark invoice as paid
   * Once paid, the store becomes accessible again (until next invoice)
   */
  async markInvoicePaid(
    invoiceId: string,
    paymentMethod?: string,
    paymentReference?: string,
  ): Promise<InvoiceDocument> {
    const invoice = await this.invoiceModel.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.paymentMethod = paymentMethod;
    invoice.paymentReference = paymentReference;
    await invoice.save();

    // Ensure subscription status is active
    const subscription = await this.subscriptionModel.findById(invoice.subscriptionId);
    if (subscription && subscription.status !== SubscriptionStatus.ACTIVE) {
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.suspendedAt = undefined;
      subscription.suspensionReason = undefined;
      await subscription.save();
    }

    this.logger.log(`Invoice ${invoice.invoiceNumber} marked as paid. Store ${invoice.storeId} is now accessible.`);
    return invoice;
  }

  /**
   * Get invoices for an organization
   */
  async getInvoicesByOrganization(
    organizationId: string,
    storeId?: string,
    status?: InvoiceStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ invoices: InvoiceDocument[]; total: number }> {
    const filter: any = {
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    if (status) {
      filter.status = status;
    }

    const [invoices, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.invoiceModel.countDocuments(filter),
    ]);

    return { invoices, total };
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(invoiceId: string): Promise<InvoiceDocument | null> {
    return this.invoiceModel.findById(invoiceId);
  }

  /**
   * Get pending/overdue invoices for a store
   */
  async getPendingInvoices(storeId: string): Promise<InvoiceDocument[]> {
    return this.invoiceModel.find({
      storeId: new Types.ObjectId(storeId),
      status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
      isDeleted: false,
    }).sort({ dueDate: 1 });
  }

  /**
   * Cron job: Generate invoices for subscriptions due today
   * Runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDueInvoices(): Promise<void> {
    this.logger.log('Running invoice generation cron job...');

    const now = new Date();
    const dueSubscriptions = await this.subscriptionModel.find({
      nextInvoiceDate: { $lte: now },
      status: SubscriptionStatus.ACTIVE,
      isDeleted: false,
    });

    this.logger.log(`Found ${dueSubscriptions.length} subscriptions due for invoicing`);

    for (const subscription of dueSubscriptions) {
      try {
        await this.generateInvoice(subscription);
      } catch (error) {
        this.logger.error(`Failed to generate invoice for subscription ${subscription._id}: ${error.message}`);
      }
    }
  }

  /**
   * Cron job: Mark overdue invoices (for reporting purposes)
   * Runs daily at 1 AM
   * Note: Store is already blocked when invoice is generated (PENDING status)
   */
  @Cron('0 1 * * *')
  async markOverdueInvoices(): Promise<void> {
    this.logger.log('Running overdue invoice check...');

    const now = new Date();

    // Mark invoices as overdue if pending for more than 7 days (for reporting/escalation)
    const overdueThreshold = new Date(now);
    overdueThreshold.setDate(overdueThreshold.getDate() - 7);

    // Find pending invoices older than 7 days
    const overdueInvoices = await this.invoiceModel.find({
      status: InvoiceStatus.PENDING,
      createdAt: { $lt: overdueThreshold },
      isDeleted: false,
    });

    this.logger.log(`Found ${overdueInvoices.length} overdue invoices`);

    for (const invoice of overdueInvoices) {
      try {
        // Mark invoice as overdue (for reporting purposes)
        invoice.status = InvoiceStatus.OVERDUE;
        await invoice.save();
        this.logger.log(`Marked invoice ${invoice.invoiceNumber} as overdue`);
      } catch (error) {
        this.logger.error(`Failed to process overdue invoice ${invoice._id}: ${error.message}`);
      }
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(storeId: string): Promise<SubscriptionDocument> {
    const subscription = await this.getByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    await subscription.save();

    this.logger.log(`Cancelled subscription for store ${storeId}`);
    return subscription;
  }

  /**
   * Get subscription stats for admin dashboard
   */
  async getSubscriptionStats(): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    suspendedSubscriptions: number;
    totalRevenue: number;
    pendingInvoices: number;
    overdueInvoices: number;
  }> {
    const [
      totalSubscriptions,
      activeSubscriptions,
      suspendedSubscriptions,
      paidInvoices,
      pendingInvoices,
      overdueInvoices,
    ] = await Promise.all([
      this.subscriptionModel.countDocuments({ isDeleted: false }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.ACTIVE, isDeleted: false }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.SUSPENDED, isDeleted: false }),
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.PAID, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.countDocuments({ status: InvoiceStatus.PENDING, isDeleted: false }),
      this.invoiceModel.countDocuments({ status: InvoiceStatus.OVERDUE, isDeleted: false }),
    ]);

    return {
      totalSubscriptions,
      activeSubscriptions,
      suspendedSubscriptions,
      totalRevenue: paidInvoices[0]?.total || 0,
      pendingInvoices,
      overdueInvoices,
    };
  }
}
