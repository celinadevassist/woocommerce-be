import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schema/user.schema';
import { Store, StoreDocument } from '../store/schema';
import { Subscription, SubscriptionDocument, Invoice, InvoiceDocument, SubscriptionStatus, InvoiceStatus } from '../subscription/schema';
import {
  AdminQueryUsersDTO,
  AdminQueryStoresDTO,
  AdminQuerySubscriptionsDTO,
  AdminQueryInvoicesDTO,
} from './dto.query';
import {
  AdminUpdateUserDTO,
  AdminSuspendStoreDTO,
  AdminUpdateSubscriptionDTO,
  AdminCancelSubscriptionDTO,
  AdminMarkInvoicePaidDTO,
  AdminCancelInvoiceDTO,
} from './dto.update';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {}

  // ==================== DASHBOARD STATS ====================

  async getDashboardStats() {
    const [
      totalUsers,
      adminUsers,
      totalStores,
      activeStores,
      suspendedStores,
      totalSubscriptions,
      activeSubscriptions,
      trialSubscriptions,
      totalInvoices,
      pendingInvoices,
      overdueInvoices,
      paidInvoices,
      totalRevenue,
      thisMonthRevenue,
    ] = await Promise.all([
      this.userModel.countDocuments({ isDeleted: { $ne: true } }),
      this.userModel.countDocuments({ role: 'admin', isDeleted: { $ne: true } }),
      this.storeModel.countDocuments({ isDeleted: false }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.ACTIVE, isDeleted: { $ne: true } }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.SUSPENDED, isDeleted: { $ne: true } }),
      this.subscriptionModel.countDocuments({ isDeleted: { $ne: true } }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.ACTIVE, isDeleted: { $ne: true } }),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.TRIAL, isDeleted: { $ne: true } }),
      this.invoiceModel.countDocuments({ isDeleted: { $ne: true } }),
      this.invoiceModel.countDocuments({ status: InvoiceStatus.PENDING, isDeleted: { $ne: true } }),
      this.invoiceModel.countDocuments({ status: InvoiceStatus.OVERDUE, isDeleted: { $ne: true } }),
      this.invoiceModel.countDocuments({ status: InvoiceStatus.PAID, isDeleted: { $ne: true } }),
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.PAID, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        {
          $match: {
            status: InvoiceStatus.PAID,
            isDeleted: { $ne: true },
            paidAt: {
              $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    // Get pending invoice amounts
    const pendingAmount = await this.invoiceModel.aggregate([
      { $match: { status: InvoiceStatus.PENDING, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const overdueAmount = await this.invoiceModel.aggregate([
      { $match: { status: InvoiceStatus.OVERDUE, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return {
      users: {
        total: totalUsers,
        admins: adminUsers,
        regular: totalUsers - adminUsers,
      },
      stores: {
        total: totalStores,
        active: activeStores,
        suspended: suspendedStores,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        trial: trialSubscriptions,
      },
      invoices: {
        total: totalInvoices,
        pending: {
          count: pendingInvoices,
          amount: pendingAmount[0]?.total || 0,
        },
        overdue: {
          count: overdueInvoices,
          amount: overdueAmount[0]?.total || 0,
        },
        paid: paidInvoices,
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        thisMonth: thisMonthRevenue[0]?.total || 0,
      },
    };
  }

  // ==================== USERS MANAGEMENT ====================

  async getUsers(query: AdminQueryUsersDTO) {
    const { page = 1, size = 20, keyword, role, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * size;

    const filter: any = { isDeleted: { $ne: true } };

    if (keyword) {
      filter.$or = [
        { email: { $regex: keyword, $options: 'i' } },
        { firstName: { $regex: keyword, $options: 'i' } },
        { lastName: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(size)
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    // Get store counts for each user
    const usersWithStores = await Promise.all(
      users.map(async (user) => {
        const [ownedStores, memberStores] = await Promise.all([
          this.storeModel.countDocuments({ ownerId: user._id, isDeleted: false }),
          this.storeModel.countDocuments({ 'members.userId': user._id, isDeleted: false }),
        ]);
        return {
          ...user,
          storesOwned: ownedStores,
          storesMember: memberStores,
        };
      }),
    );

    return {
      data: usersWithStores,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  async getUserById(userId: string) {
    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(userId), isDeleted: { $ne: true } })
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get owned stores with subscription info
    const ownedStores = await this.storeModel
      .find({ ownerId: user._id, isDeleted: false })
      .lean();

    const storesWithSubscription = await Promise.all(
      ownedStores.map(async (store) => {
        const subscription = await this.subscriptionModel.findOne({ storeId: store._id }).lean();
        const pendingInvoices = await this.invoiceModel.countDocuments({
          storeId: store._id,
          status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
        });
        return {
          ...store,
          subscription: subscription ? {
            status: subscription.status,
            nextInvoiceDate: subscription.nextInvoiceDate,
          } : null,
          pendingInvoices,
        };
      }),
    );

    // Get stores where user is a member
    const memberStores = await this.storeModel
      .find({ 'members.userId': user._id, isDeleted: false })
      .populate('ownerId', 'firstName lastName email')
      .lean();

    return {
      ...user,
      ownedStores: storesWithSubscription,
      memberStores: memberStores.map((store) => ({
        ...store,
        role: store.members.find((m) => m.userId.toString() === userId)?.role,
      })),
    };
  }

  async updateUser(userId: string, data: AdminUpdateUserDTO, adminId: string) {
    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent self-demotion
    if (userId === adminId && data.role && data.role !== 'admin') {
      throw new BadRequestException('Cannot change your own admin role');
    }

    // Check if this would remove the last admin
    if (data.role && data.role !== 'admin' && user.role === 'admin') {
      const adminCount = await this.userModel.countDocuments({
        role: 'admin',
        isDeleted: { $ne: true },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin user');
      }
    }

    if (data.role) user.role = data.role;

    await user.save();

    this.logger.log(`Admin ${adminId} updated user ${userId}: ${JSON.stringify(data)}`);

    return user;
  }

  async deleteUser(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const user = await this.userModel.findOne({
      _id: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      throw new ForbiddenException('Cannot delete admin users');
    }

    // Soft delete using updateOne (adds isDeleted field dynamically)
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { isDeleted: true } },
    );

    this.logger.log(`Admin ${adminId} deleted user ${userId}`);

    return { message: 'User deleted successfully' };
  }

  // ==================== STORES MANAGEMENT ====================

  async getStores(query: AdminQueryStoresDTO) {
    const { page = 1, size = 20, keyword, status, subscriptionStatus, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * size;

    const filter: any = { isDeleted: false };

    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { url: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    const [stores, total] = await Promise.all([
      this.storeModel
        .find(filter)
        .populate('ownerId', 'firstName lastName email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(size)
        .lean(),
      this.storeModel.countDocuments(filter),
    ]);

    // Get subscription info for each store
    let storesWithDetails = await Promise.all(
      stores.map(async (store) => {
        const subscription = await this.subscriptionModel.findOne({ storeId: store._id }).lean();
        const pendingInvoices = await this.invoiceModel.countDocuments({
          storeId: store._id,
          status: { $in: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
        });
        return {
          ...store,
          membersCount: store.members?.length || 0,
          subscription: subscription ? {
            status: subscription.status,
            nextInvoiceDate: subscription.nextInvoiceDate,
            trialEndsAt: subscription.trialEndsAt,
          } : null,
          pendingInvoices,
        };
      }),
    );

    // Filter by subscription status if provided
    if (subscriptionStatus) {
      storesWithDetails = storesWithDetails.filter(
        (store) => store.subscription?.status === subscriptionStatus,
      );
    }

    return {
      data: storesWithDetails,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  async getStoreById(storeId: string) {
    const store = await this.storeModel
      .findOne({ _id: new Types.ObjectId(storeId), isDeleted: false })
      .populate('ownerId', 'firstName lastName email')
      .populate('members.userId', 'firstName lastName email')
      .lean();

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const [subscription, invoices] = await Promise.all([
      this.subscriptionModel.findOne({ storeId: store._id }).lean(),
      this.invoiceModel
        .find({ storeId: store._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      ...store,
      subscription,
      recentInvoices: invoices,
    };
  }

  async suspendStore(storeId: string, data: AdminSuspendStoreDTO, adminId: string) {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Suspend the subscription (suspension state tracked in subscription, not store status)
    await this.subscriptionModel.updateOne(
      { storeId: store._id },
      {
        status: SubscriptionStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspensionReason: data.reason,
      },
    );

    this.logger.log(`Admin ${adminId} suspended store ${storeId}: ${data.reason}`);

    return { message: 'Store suspended successfully' };
  }

  async unsuspendStore(storeId: string, adminId: string) {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Reactivate the subscription (suspension state tracked in subscription, not store status)
    await this.subscriptionModel.updateOne(
      { storeId: store._id },
      {
        status: SubscriptionStatus.ACTIVE,
        $unset: { suspendedAt: 1, suspensionReason: 1 },
      },
    );

    this.logger.log(`Admin ${adminId} unsuspended store ${storeId}`);

    return { message: 'Store unsuspended successfully' };
  }

  async deleteStore(storeId: string, adminId: string) {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Soft delete
    store.isDeleted = true;
    await store.save();

    // Cancel subscription
    await this.subscriptionModel.updateOne(
      { storeId: store._id },
      { status: SubscriptionStatus.CANCELLED, isDeleted: true },
    );

    this.logger.log(`Admin ${adminId} deleted store ${storeId}`);

    return { message: 'Store deleted successfully' };
  }

  // ==================== SUBSCRIPTIONS MANAGEMENT ====================

  async getSubscriptions(query: AdminQuerySubscriptionsDTO) {
    const { page = 1, size = 20, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * size;

    const filter: any = { isDeleted: { $ne: true } };

    if (status) {
      filter.status = status;
    }

    const [subscriptions, total] = await Promise.all([
      this.subscriptionModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(size)
        .lean(),
      this.subscriptionModel.countDocuments(filter),
    ]);

    // Get store and owner info for each subscription
    const subscriptionsWithDetails = await Promise.all(
      subscriptions.map(async (sub) => {
        const store = await this.storeModel
          .findById(sub.storeId)
          .populate('ownerId', 'firstName lastName email')
          .lean();
        return {
          ...sub,
          store: store ? {
            id: store._id,
            name: store.name,
            url: store.url,
            owner: store.ownerId,
          } : null,
        };
      }),
    );

    return {
      data: subscriptionsWithDetails,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  async updateSubscription(subscriptionId: string, data: AdminUpdateSubscriptionDTO, adminId: string) {
    const subscription = await this.subscriptionModel.findOne({
      _id: new Types.ObjectId(subscriptionId),
      isDeleted: { $ne: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Update all provided fields
    if (data.status) subscription.status = data.status as SubscriptionStatus;
    if (data.plan !== undefined) subscription.plan = data.plan;
    if (data.pricePerMonth !== undefined) subscription.pricePerMonth = data.pricePerMonth;
    if (data.currency) subscription.currency = data.currency;
    if (data.billingCycle) subscription.billingCycle = data.billingCycle;
    if (data.discount !== undefined) subscription.discount = data.discount;
    if (data.trialEndsAt !== undefined) subscription.trialEndsAt = data.trialEndsAt;
    if (data.notes !== undefined) subscription.notes = data.notes;

    await subscription.save();

    this.logger.log(`Admin ${adminId} updated subscription ${subscriptionId}: ${JSON.stringify(data)}`);

    return subscription;
  }

  async cancelSubscription(storeId: string, data: AdminCancelSubscriptionDTO, adminId: string) {
    const subscription = await this.subscriptionModel.findOne({
      storeId: new Types.ObjectId(storeId),
      isDeleted: { $ne: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.suspensionReason = data.reason;
    await subscription.save();

    // Also update store status
    await this.storeModel.updateOne(
      { _id: new Types.ObjectId(storeId) },
      { status: 'suspended' },
    );

    this.logger.log(`Admin ${adminId} cancelled subscription for store ${storeId}: ${data.reason}`);

    return { message: 'Subscription cancelled successfully' };
  }

  async reactivateSubscription(storeId: string, adminId: string) {
    const subscription = await this.subscriptionModel.findOne({
      storeId: new Types.ObjectId(storeId),
      isDeleted: { $ne: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.suspensionReason = undefined;
    subscription.suspendedAt = undefined;
    await subscription.save();

    // Also update store status
    await this.storeModel.updateOne(
      { _id: new Types.ObjectId(storeId) },
      { status: 'active' },
    );

    this.logger.log(`Admin ${adminId} reactivated subscription for store ${storeId}`);

    return { message: 'Subscription reactivated successfully' };
  }

  // ==================== INVOICES MANAGEMENT ====================

  async getInvoices(query: AdminQueryInvoicesDTO) {
    const { page = 1, size = 20, status, storeId, dateFrom, dateTo, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * size;

    const filter: any = { isDeleted: { $ne: true } };

    if (status) {
      filter.status = status;
    }

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const [invoices, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(size)
        .lean(),
      this.invoiceModel.countDocuments(filter),
    ]);

    // Get store info for each invoice
    const invoicesWithStore = await Promise.all(
      invoices.map(async (invoice) => {
        const store = await this.storeModel
          .findById(invoice.storeId)
          .select('name url')
          .lean();
        return {
          ...invoice,
          store: store ? { name: store.name, url: store.url } : null,
        };
      }),
    );

    return {
      data: invoicesWithStore,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  async getInvoiceStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalRevenue,
      thisMonthRevenue,
      lastMonthRevenue,
      pendingStats,
      overdueStats,
      revenueByMonth,
    ] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.PAID, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        {
          $match: {
            status: InvoiceStatus.PAID,
            isDeleted: { $ne: true },
            paidAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        {
          $match: {
            status: InvoiceStatus.PAID,
            isDeleted: { $ne: true },
            paidAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.PENDING, isDeleted: { $ne: true } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.OVERDUE, isDeleted: { $ne: true } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        {
          $match: {
            status: InvoiceStatus.PAID,
            isDeleted: { $ne: true },
            paidAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      totalRevenue: totalRevenue[0]?.total || 0,
      thisMonth: thisMonthRevenue[0]?.total || 0,
      lastMonth: lastMonthRevenue[0]?.total || 0,
      pending: {
        count: pendingStats[0]?.count || 0,
        amount: pendingStats[0]?.amount || 0,
      },
      overdue: {
        count: overdueStats[0]?.count || 0,
        amount: overdueStats[0]?.amount || 0,
      },
      revenueByMonth: revenueByMonth.map((r) => ({
        month: r._id,
        amount: r.amount,
      })),
    };
  }

  async markInvoicePaid(invoiceId: string, data: AdminMarkInvoicePaidDTO, adminId: string) {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(invoiceId),
      isDeleted: { $ne: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.paymentMethod = data.paymentMethod;
    invoice.paymentReference = data.paymentReference || `ADMIN-${adminId}-${Date.now()}`;
    await invoice.save();

    // Activate the subscription
    await this.subscriptionModel.updateOne(
      { storeId: invoice.storeId },
      { status: SubscriptionStatus.ACTIVE },
    );

    this.logger.log(`Admin ${adminId} marked invoice ${invoiceId} as paid: ${JSON.stringify(data)}`);

    return invoice;
  }

  async cancelInvoice(invoiceId: string, data: AdminCancelInvoiceDTO, adminId: string) {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(invoiceId),
      isDeleted: { $ne: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel a paid invoice');
    }

    invoice.status = InvoiceStatus.CANCELLED;
    await invoice.save();

    this.logger.log(`Admin ${adminId} cancelled invoice ${invoiceId}: ${data.reason}`);

    return { message: 'Invoice cancelled successfully' };
  }

  // ==================== CREATE SUBSCRIPTION ====================

  async createSubscriptionForStore(
    storeId: string,
    data: { plan?: string; pricePerMonth: number; currency?: string; billingCycle?: string; trialDays?: number },
    adminId: string,
  ) {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Check if subscription already exists
    const existingSubscription = await this.subscriptionModel.findOne({
      storeId: store._id,
      isDeleted: { $ne: true },
    });

    if (existingSubscription) {
      throw new BadRequestException('Store already has a subscription');
    }

    const now = new Date();
    const billingCycleDays = data.billingCycle === 'yearly' ? 365 : 30;
    const nextInvoiceDate = new Date(now);
    nextInvoiceDate.setDate(nextInvoiceDate.getDate() + billingCycleDays);

    // Handle trial period
    let status = SubscriptionStatus.ACTIVE;
    let trialEndsAt: Date | undefined;
    if (data.trialDays && data.trialDays > 0) {
      status = SubscriptionStatus.TRIAL;
      trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + data.trialDays);
    }

    const subscription = await this.subscriptionModel.create({
      storeId: store._id,
      status,
      plan: data.plan || 'standard',
      pricePerMonth: data.pricePerMonth,
      currency: data.currency || 'USD',
      billingCycle: data.billingCycle || 'monthly',
      billingCycleStart: now,
      nextInvoiceDate,
      trialEndsAt,
    });

    this.logger.log(`Admin ${adminId} created subscription for store ${storeId}`);

    return {
      message: 'Subscription created successfully',
      subscription,
    };
  }

  // ==================== GENERATE INVOICE ====================

  async generateInvoice(
    storeId: string,
    data: { amount: number; description?: string; dueInDays?: number },
    adminId: string,
  ) {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const subscription = await this.subscriptionModel.findOne({
      storeId: store._id,
      isDeleted: { $ne: true },
    });

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + (data.dueInDays || 30));

    // Generate invoice number
    const invoiceCount = await this.invoiceModel.countDocuments();
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(6, '0')}`;

    const invoice = await this.invoiceModel.create({
      storeId: store._id,
      subscriptionId: subscription?._id,
      invoiceNumber,
      amount: data.amount,
      currency: subscription?.currency || 'USD',
      status: InvoiceStatus.PENDING,
      description: data.description || `Invoice for ${store.name}`,
      dueDate,
      billingPeriodStart: now,
      billingPeriodEnd: dueDate,
    });

    this.logger.log(`Admin ${adminId} generated invoice ${invoiceNumber} for store ${storeId}`);

    return {
      message: 'Invoice generated successfully',
      invoice,
    };
  }
}
