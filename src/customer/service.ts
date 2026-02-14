import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schema';
import { CustomerSegment, CustomerSegmentDocument } from './segment.schema';
import { UpdateCustomerDto, AddCustomerNoteDto } from './dto.update';
import { QueryCustomerDto } from './dto.query';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  ICustomerSegment,
} from './segment.dto';
import {
  ICustomer,
  ICustomerResponse,
  ICustomerAggregateStats,
  ICustomerNote,
} from './interface';
import { CustomerStatus, CustomerSource } from './enum';
import { Store, StoreDocument } from '../store/schema';
import { Order, OrderDocument } from '../order/schema';
import { WooCustomer } from '../integrations/woocommerce/woocommerce.types';
import { PhoneService } from '../phone/service';
import { EmailService } from '../email/service';
import { SearchAnalyticsService } from '../modules/search-analytics/search-analytics.service';

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerSegment.name)
    private segmentModel: Model<CustomerSegmentDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @Inject(forwardRef(() => PhoneService))
    private readonly phoneService: PhoneService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
    private readonly searchAnalyticsService: SearchAnalyticsService,
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
  ): Promise<StoreDocument> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

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
   * Normalize phone number to unified format: +{countryCode}{number}
   * Removes spaces, dashes, parentheses
   * Converts Arabic numerals to English
   * Handles Egyptian numbers: converts 01xxx to +201xxx
   */
  normalizePhoneNumber(
    phone: string,
    defaultCountryCode = '20',
  ): string | null {
    if (!phone) return null;

    // Convert Arabic/Persian numerals to English
    const arabicNumerals = '٠١٢٣٤٥٦٧٨٩';
    const persianNumerals = '۰۱۲۳۴۵۶۷۸۹';
    let converted = phone;
    for (let i = 0; i < 10; i++) {
      converted = converted.replace(
        new RegExp(arabicNumerals[i], 'g'),
        String(i),
      );
      converted = converted.replace(
        new RegExp(persianNumerals[i], 'g'),
        String(i),
      );
    }

    // Remove all non-digit characters except +
    const normalized = converted.replace(/[^\d+]/g, '');

    // If empty after cleanup, return null
    if (!normalized || normalized.replace(/\+/g, '').length === 0) {
      return null;
    }

    // If starts with +, keep as is
    if (normalized.startsWith('+')) {
      return normalized;
    }

    // If starts with 00, replace with +
    if (normalized.startsWith('00')) {
      return '+' + normalized.substring(2);
    }

    // Egyptian number handling
    if (defaultCountryCode === '20') {
      // If starts with 0 (local format like 01273215943), add country code
      if (normalized.startsWith('0')) {
        return '+2' + normalized;
      }
      // If starts with country code without + (like 201273215943)
      if (normalized.startsWith('20') && normalized.length >= 11) {
        return '+' + normalized;
      }
    }

    // Default: add + and country code
    return '+' + defaultCountryCode + normalized;
  }

  /**
   * Calculate customer stats dynamically from orders (excluding canceled)
   */
  async calculateCustomerStats(customerId: string | Types.ObjectId): Promise<{
    ordersCount: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate: Date | null;
    firstOrderDate: Date | null;
  }> {
    const result = await this.orderModel.aggregate([
      {
        $match: {
          localCustomerId: new Types.ObjectId(customerId),
          status: {
            $nin: ['cancelled', 'canceled', 'refunded', 'failed', 'trash'],
          },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          ordersCount: { $sum: 1 },
          totalSpent: { $sum: { $toDouble: '$total' } },
          lastOrderDate: { $max: '$dateCreatedWoo' },
          firstOrderDate: { $min: '$dateCreatedWoo' },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        ordersCount: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        lastOrderDate: null,
        firstOrderDate: null,
      };
    }

    const stats = result[0];
    return {
      ordersCount: stats.ordersCount || 0,
      totalSpent: stats.totalSpent || 0,
      averageOrderValue:
        stats.ordersCount > 0 ? stats.totalSpent / stats.ordersCount : 0,
      lastOrderDate: stats.lastOrderDate || null,
      firstOrderDate: stats.firstOrderDate || null,
    };
  }

  /**
   * Calculate stats for multiple customers at once (for list views)
   */
  async calculateBulkCustomerStats(
    customerIds: (string | Types.ObjectId)[],
  ): Promise<
    Map<
      string,
      {
        ordersCount: number;
        totalSpent: number;
        averageOrderValue: number;
        lastOrderDate: Date | null;
        firstOrderDate: Date | null;
      }
    >
  > {
    const objectIds = customerIds.map((id) => new Types.ObjectId(id));

    const results = await this.orderModel.aggregate([
      {
        $match: {
          localCustomerId: { $in: objectIds },
          status: {
            $nin: ['cancelled', 'canceled', 'refunded', 'failed', 'trash'],
          },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$localCustomerId',
          ordersCount: { $sum: 1 },
          totalSpent: { $sum: { $toDouble: '$total' } },
          lastOrderDate: { $max: '$dateCreatedWoo' },
          firstOrderDate: { $min: '$dateCreatedWoo' },
        },
      },
    ]);

    const statsMap = new Map<string, any>();

    // Initialize all customers with zero stats
    for (const id of customerIds) {
      statsMap.set(id.toString(), {
        ordersCount: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        lastOrderDate: null,
        firstOrderDate: null,
      });
    }

    // Update with actual stats
    for (const result of results) {
      const customerId = result._id.toString();
      statsMap.set(customerId, {
        ordersCount: result.ordersCount || 0,
        totalSpent: result.totalSpent || 0,
        averageOrderValue:
          result.ordersCount > 0 ? result.totalSpent / result.ordersCount : 0,
        lastOrderDate: result.lastOrderDate || null,
        firstOrderDate: result.firstOrderDate || null,
      });
    }

    return statsMap;
  }

  /**
   * Get customers with filtering and pagination
   */
  async findAll(
    userId: string,
    query: QueryCustomerDto,
    ip?: string,
  ): Promise<ICustomerResponse> {
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
    if (query.source) {
      filter.source = query.source;
    }
    if (query.tier) {
      filter.tier = query.tier;
    }
    if (query.email) {
      filter.email = { $regex: query.email, $options: 'i' };
    }
    if (query.phone) {
      filter.phone = { $regex: query.phone, $options: 'i' };
    }
    if (query.isPayingCustomer !== undefined) {
      filter.isPayingCustomer = query.isPayingCustomer;
    }
    // Note: minOrders, maxOrders, minSpent, maxSpent filters are applied after fetching
    // since stats are now calculated dynamically from orders
    if (query.tags && query.tags.length > 0) {
      const tagsArray = Array.isArray(query.tags) ? query.tags : [query.tags];
      filter.tags = { $in: tagsArray };
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }
    if (query.search) {
      filter.$or = [
        { email: { $regex: query.search, $options: 'i' } },
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [customers, total] = await Promise.all([
      this.customerModel.find(filter).sort(sort).skip(skip).limit(size),
      this.customerModel.countDocuments(filter),
    ]);

    // Track search analytics if search query is provided
    if (query.search) {
      await this.searchAnalyticsService.saveSearchQuery(
        query.search,
        'customers',
        total,
        ip,
        userId,
      );
    }

    // Calculate dynamic stats for all customers in bulk
    const customerIds = customers.map((c) => c._id);
    const statsMap = await this.calculateBulkCustomerStats(customerIds);

    // Map customers with their dynamic stats
    let customersWithStats = customers.map((c) => {
      const customer = this.toInterface(c);
      customer.stats = statsMap.get(c._id.toString()) || {
        ordersCount: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        lastOrderDate: null,
        firstOrderDate: null,
      };
      return customer;
    });

    // Apply stats-based filters (post-fetch filtering)
    if (query.minOrders !== undefined) {
      customersWithStats = customersWithStats.filter(
        (c) => c.stats.ordersCount >= query.minOrders,
      );
    }
    if (query.maxOrders !== undefined) {
      customersWithStats = customersWithStats.filter(
        (c) => c.stats.ordersCount <= query.maxOrders,
      );
    }
    if (query.minSpent !== undefined) {
      customersWithStats = customersWithStats.filter(
        (c) => c.stats.totalSpent >= query.minSpent,
      );
    }
    if (query.maxSpent !== undefined) {
      customersWithStats = customersWithStats.filter(
        (c) => c.stats.totalSpent <= query.maxSpent,
      );
    }

    return {
      customers: customersWithStats,
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get customer by ID with dynamic stats
   */
  async findById(id: string, userId: string): Promise<ICustomer> {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.verifyStoreAccess(customer.storeId.toString(), userId);

    // Calculate dynamic stats from orders
    const stats = await this.calculateCustomerStats(id);

    const result = this.toInterface(customer);
    result.stats = stats;

    return result;
  }

  /**
   * Get customer by email for a store
   */
  async findByEmail(
    storeId: string,
    email: string,
  ): Promise<CustomerDocument | null> {
    return this.customerModel.findOne({
      storeId: new Types.ObjectId(storeId),
      email: email.toLowerCase(),
      isDeleted: false,
    });
  }

  /**
   * Update customer (internal fields only)
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateCustomerDto,
  ): Promise<ICustomer> {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.verifyStoreAccess(customer.storeId.toString(), userId);

    // Update fields
    if (dto.status) customer.status = dto.status;
    if (dto.tier) customer.tier = dto.tier;
    if (dto.tags) customer.tags = dto.tags;

    await customer.save();
    return this.toInterface(customer);
  }

  /**
   * Add note to customer
   */
  async addNote(
    id: string,
    userId: string,
    userName: string,
    dto: AddCustomerNoteDto,
  ): Promise<ICustomer> {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.verifyStoreAccess(customer.storeId.toString(), userId);

    const note = {
      _id: new Types.ObjectId(),
      content: dto.content,
      addedBy: userName,
      addedByUserId: new Types.ObjectId(userId),
      createdAt: new Date(),
    };

    customer.notes.push(note as any);
    await customer.save();

    return this.toInterface(customer);
  }

  /**
   * Delete note from customer
   */
  async deleteNote(
    id: string,
    noteId: string,
    userId: string,
  ): Promise<ICustomer> {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.verifyStoreAccess(customer.storeId.toString(), userId);

    const noteIndex = customer.notes.findIndex(
      (n: any) => n._id.toString() === noteId,
    );

    if (noteIndex === -1) {
      throw new NotFoundException('Note not found');
    }

    customer.notes.splice(noteIndex, 1);
    await customer.save();

    return this.toInterface(customer);
  }

  /**
   * Update customer stats (called when orders are synced)
   */
  async updateStats(
    customerId: string,
    stats: {
      ordersCount?: number;
      totalSpent?: number;
      lastOrderDate?: Date;
      firstOrderDate?: Date;
    },
  ): Promise<void> {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) return;

    if (stats.ordersCount !== undefined) {
      customer.stats.ordersCount = stats.ordersCount;
    }
    if (stats.totalSpent !== undefined) {
      customer.stats.totalSpent = stats.totalSpent;
      if (customer.stats.ordersCount > 0) {
        customer.stats.averageOrderValue =
          stats.totalSpent / customer.stats.ordersCount;
      }
    }
    if (stats.lastOrderDate) {
      customer.stats.lastOrderDate = stats.lastOrderDate;
    }
    if (stats.firstOrderDate) {
      if (
        !customer.stats.firstOrderDate ||
        stats.firstOrderDate < customer.stats.firstOrderDate
      ) {
        customer.stats.firstOrderDate = stats.firstOrderDate;
      }
    }

    await customer.save();
  }

  /**
   * Recalculate stats endpoint (deprecated - stats are now calculated dynamically from orders)
   * This method is kept for backwards compatibility but stats are always fresh from orders
   */
  async recalculateAllStats(
    userId: string,
    storeId?: string,
  ): Promise<{ message: string }> {
    return {
      message:
        'Stats are now calculated dynamically from orders. No recalculation needed - stats are always up-to-date.',
    };
  }

  /**
   * Get customer statistics (calculated dynamically from orders)
   */
  async getStats(
    userId: string,
    storeId?: string,
  ): Promise<ICustomerAggregateStats> {
    const storeIds = await this.getUserStoreIds(userId);

    const customerFilter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    const orderFilter: any = {
      storeId: { $in: storeIds },
      status: {
        $nin: ['cancelled', 'canceled', 'refunded', 'failed', 'trash'],
      },
      isDeleted: { $ne: true },
    };

    if (storeId) {
      customerFilter.storeId = new Types.ObjectId(storeId);
      orderFilter.storeId = new Types.ObjectId(storeId);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth,
      orderStats,
      customerOrderStats,
    ] = await Promise.all([
      this.customerModel.countDocuments(customerFilter),
      this.customerModel.countDocuments({
        ...customerFilter,
        status: CustomerStatus.ACTIVE,
      }),
      this.customerModel.countDocuments({
        ...customerFilter,
        createdAt: { $gte: startOfMonth },
      }),
      // Calculate order stats directly from orders collection
      this.orderModel.aggregate([
        { $match: orderFilter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: { $toDouble: '$total' } },
          },
        },
      ]),
      // Calculate per-customer stats from orders (for repeat customers and averages)
      this.orderModel.aggregate([
        {
          $match: {
            ...orderFilter,
            localCustomerId: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$localCustomerId',
            ordersCount: { $sum: 1 },
            totalSpent: { $sum: { $toDouble: '$total' } },
          },
        },
        {
          $group: {
            _id: null,
            repeatCustomers: {
              $sum: { $cond: [{ $gte: ['$ordersCount', 2] }, 1, 0] },
            },
            avgOrdersPerCustomer: { $avg: '$ordersCount' },
            avgSpentPerCustomer: { $avg: '$totalSpent' },
          },
        },
      ]),
    ]);

    const stats = orderStats[0] || { totalOrders: 0, totalRevenue: 0 };
    const custStats = customerOrderStats[0] || {
      repeatCustomers: 0,
      avgOrdersPerCustomer: 0,
      avgSpentPerCustomer: 0,
    };

    // Get top customers by calculating their total spent from orders
    const topCustomersAgg = await this.orderModel.aggregate([
      {
        $match: {
          ...orderFilter,
          localCustomerId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$localCustomerId',
          totalSpent: { $sum: { $toDouble: '$total' } },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 },
    ]);

    // Fetch customer details for top customers
    const topCustomerIds = topCustomersAgg.map((c) => c._id);
    const topCustomerDocs = await this.customerModel.find({
      _id: { $in: topCustomerIds },
    });
    const topCustomerMap = new Map(
      topCustomerDocs.map((c) => [c._id.toString(), c]),
    );

    const topCustomers = topCustomersAgg
      .map((agg) => {
        const customer = topCustomerMap.get(agg._id.toString());
        if (customer) {
          const customerInterface = this.toInterface(customer);
          customerInterface.stats = {
            ordersCount: agg.ordersCount,
            totalSpent: agg.totalSpent,
            averageOrderValue:
              agg.ordersCount > 0 ? agg.totalSpent / agg.ordersCount : 0,
            lastOrderDate: null,
            firstOrderDate: null,
          };
          return customerInterface;
        }
        return null;
      })
      .filter(Boolean);

    return {
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth,
      repeatCustomers: custStats.repeatCustomers || 0,
      totalRevenue: stats.totalRevenue || 0,
      totalOrders: stats.totalOrders || 0,
      averageOrderValue:
        stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0,
      averageOrdersPerCustomer: custStats.avgOrdersPerCustomer || 0,
      averageSpentPerCustomer: custStats.avgSpentPerCustomer || 0,
      topCustomers: topCustomers as ICustomer[],
    };
  }

  /**
   * Get customer count by store
   */
  async getCustomerCountByStore(storeId: string): Promise<number> {
    return this.customerModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  /**
   * Get customer analytics and insights (calculated dynamically from orders)
   */
  async getAnalytics(
    userId: string,
    storeId?: string,
    period: 'week' | 'month' | 'quarter' | 'year' = 'month',
  ): Promise<any> {
    const storeIds = await this.getUserStoreIds(userId);

    const customerFilter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    const orderFilter: any = {
      storeId: { $in: storeIds },
      status: {
        $nin: ['cancelled', 'canceled', 'refunded', 'failed', 'trash'],
      },
      isDeleted: { $ne: true },
    };

    if (storeId) {
      customerFilter.storeId = new Types.ObjectId(storeId);
      orderFilter.storeId = new Types.ObjectId(storeId);
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Calculate per-customer stats from orders
    const customerOrderStats = await this.orderModel.aggregate([
      {
        $match: {
          ...orderFilter,
          localCustomerId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$localCustomerId',
          ordersCount: { $sum: 1 },
          totalSpent: { $sum: { $toDouble: '$total' } },
        },
      },
    ]);

    // Create a map of customer stats
    const customerStatsMap = new Map<
      string,
      { ordersCount: number; totalSpent: number }
    >();
    for (const stat of customerOrderStats) {
      customerStatsMap.set(stat._id.toString(), {
        ordersCount: stat.ordersCount,
        totalSpent: stat.totalSpent,
      });
    }

    // Get all customers
    const allCustomers = await this.customerModel
      .find(customerFilter)
      .select('_id billing.country');
    const customerIds = allCustomers.map((c) => c._id.toString());

    // Calculate repeat customers (2+ orders) from order stats
    let repeatCustomers = 0;
    for (const stat of customerOrderStats) {
      if (stat.ordersCount >= 2) {
        repeatCustomers++;
      }
    }

    // Overview stats
    const [totalCustomers, activeCustomers, newInPeriod, payingCustomers] =
      await Promise.all([
        this.customerModel.countDocuments(customerFilter),
        this.customerModel.countDocuments({
          ...customerFilter,
          status: CustomerStatus.ACTIVE,
        }),
        this.customerModel.countDocuments({
          ...customerFilter,
          createdAt: { $gte: startDate },
        }),
        this.customerModel.countDocuments({
          ...customerFilter,
          isPayingCustomer: true,
        }),
      ]);

    // Customer growth trend
    const growthTrend = await this.customerModel.aggregate([
      {
        $match: {
          ...customerFilter,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          newCustomers: '$count',
          _id: 0,
        },
      },
    ]);

    // Tier distribution
    const tierDistribution = await this.customerModel.aggregate([
      { $match: customerFilter },
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          tier: { $ifNull: ['$_id', 'unassigned'] },
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Source distribution
    const sourceDistribution = await this.customerModel.aggregate([
      { $match: customerFilter },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          source: { $ifNull: ['$_id', 'unknown'] },
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Geographic distribution with spending from orders
    const customersWithCountry = await this.customerModel
      .find({
        ...customerFilter,
        'billing.country': { $exists: true, $nin: [null, ''] },
      })
      .select('_id billing.country');

    const geoMap = new Map<string, { count: number; totalSpent: number }>();
    for (const customer of customersWithCountry) {
      const country = customer.billing?.country;
      if (country) {
        const stats = customerStatsMap.get(customer._id.toString()) || {
          ordersCount: 0,
          totalSpent: 0,
        };
        const existing = geoMap.get(country) || { count: 0, totalSpent: 0 };
        geoMap.set(country, {
          count: existing.count + 1,
          totalSpent: existing.totalSpent + stats.totalSpent,
        });
      }
    }
    const geoDistribution = Array.from(geoMap.entries())
      .map(([country, data]) => ({
        country,
        count: data.count,
        totalSpent: data.totalSpent,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Spending distribution from orders (using numeric ranges, frontend will format with currency)
    const spendingBuckets = [
      { range: '0-100', min: 0, max: 100, count: 0 },
      { range: '100-500', min: 100, max: 500, count: 0 },
      { range: '500-1K', min: 500, max: 1000, count: 0 },
      { range: '1K-5K', min: 1000, max: 5000, count: 0 },
      { range: '5K-10K', min: 5000, max: 10000, count: 0 },
      { range: '10K+', min: 10000, max: Infinity, count: 0 },
    ];
    for (const customerId of customerIds) {
      const stats = customerStatsMap.get(customerId) || { totalSpent: 0 };
      const spent = stats.totalSpent;
      if (spent < 100) spendingBuckets[0].count++;
      else if (spent < 500) spendingBuckets[1].count++;
      else if (spent < 1000) spendingBuckets[2].count++;
      else if (spent < 5000) spendingBuckets[3].count++;
      else if (spent < 10000) spendingBuckets[4].count++;
      else spendingBuckets[5].count++;
    }
    const spendingDistribution = spendingBuckets.map(({ range, count }) => ({
      range,
      count,
    }));

    // Top customers by spending from orders
    const topCustomersAgg = await this.orderModel.aggregate([
      {
        $match: {
          ...orderFilter,
          localCustomerId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$localCustomerId',
          totalSpent: { $sum: { $toDouble: '$total' } },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
    ]);

    const topCustomerIds = topCustomersAgg.map((c) => c._id);
    const topCustomerDocs = await this.customerModel.find({
      _id: { $in: topCustomerIds },
    });
    const topCustomerMap = new Map(
      topCustomerDocs.map((c) => [c._id.toString(), c]),
    );

    const topCustomers = topCustomersAgg.map((agg) => {
      const customer = topCustomerMap.get(agg._id.toString());
      return {
        customerId: agg._id.toString(),
        name: customer
          ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
            customer.email
          : 'Unknown',
        email: customer?.email || '',
        totalSpent: agg.totalSpent,
        ordersCount: agg.ordersCount,
        avatar: customer?.avatarUrl,
      };
    });

    // Recent customers
    const recentCustomers = await this.customerModel
      .find(customerFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .select('firstName lastName email createdAt source');

    // Customers by day of week
    const dayOfWeekDistribution = await this.customerModel.aggregate([
      { $match: customerFilter },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          dayNumber: '$_id',
          dayName: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 1] }, then: 'Sun' },
                { case: { $eq: ['$_id', 2] }, then: 'Mon' },
                { case: { $eq: ['$_id', 3] }, then: 'Tue' },
                { case: { $eq: ['$_id', 4] }, then: 'Wed' },
                { case: { $eq: ['$_id', 5] }, then: 'Thu' },
                { case: { $eq: ['$_id', 6] }, then: 'Fri' },
                { case: { $eq: ['$_id', 7] }, then: 'Sat' },
              ],
              default: 'Unknown',
            },
          },
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Order frequency stats from orders
    const orderTotals = await this.orderModel.aggregate([
      { $match: orderFilter },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: { $toDouble: '$total' } },
        },
      },
    ]);

    const orderTotalsData = orderTotals[0] || {
      totalOrders: 0,
      totalRevenue: 0,
    };
    const customersWithOrders = customerOrderStats.length;

    // Calculate max values
    let maxOrders = 0;
    let maxSpent = 0;
    for (const stat of customerOrderStats) {
      if (stat.ordersCount > maxOrders) maxOrders = stat.ordersCount;
      if (stat.totalSpent > maxSpent) maxSpent = stat.totalSpent;
    }

    const avgOrdersPerCustomer =
      customersWithOrders > 0
        ? orderTotalsData.totalOrders / customersWithOrders
        : 0;
    const avgSpentPerCustomer =
      customersWithOrders > 0
        ? orderTotalsData.totalRevenue / customersWithOrders
        : 0;
    const avgOrderValue =
      orderTotalsData.totalOrders > 0
        ? orderTotalsData.totalRevenue / orderTotalsData.totalOrders
        : 0;

    // New vs repeat customers breakdown
    let newCustomersCount = 0;
    let newCustomersTotalSpent = 0;
    let repeatCustomersCount = 0;
    let repeatCustomersTotalSpent = 0;

    for (const stat of customerOrderStats) {
      if (stat.ordersCount >= 2) {
        repeatCustomersCount++;
        repeatCustomersTotalSpent += stat.totalSpent;
      } else {
        newCustomersCount++;
        newCustomersTotalSpent += stat.totalSpent;
      }
    }

    // Tags distribution
    const tagsDistribution = await this.customerModel.aggregate([
      { $match: { ...customerFilter, tags: { $exists: true, $ne: [] } } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          tag: '$_id',
          count: 1,
          _id: 0,
        },
      },
    ]);

    return {
      overview: {
        totalCustomers,
        activeCustomers,
        newInPeriod,
        repeatCustomers,
        payingCustomers,
        repeatRate:
          totalCustomers > 0
            ? Math.round((repeatCustomers / totalCustomers) * 100)
            : 0,
      },
      growthTrend,
      tierDistribution,
      sourceDistribution,
      geoDistribution,
      spendingDistribution,
      topCustomers,
      recentCustomers: recentCustomers.map((c) => ({
        customerId: c._id.toString(),
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email,
        email: c.email,
        source: c.source,
        createdAt: c.createdAt,
      })),
      dayOfWeekDistribution,
      frequencyStats: {
        avgOrdersPerCustomer: Math.round(avgOrdersPerCustomer * 100) / 100,
        avgSpentPerCustomer: Math.round(avgSpentPerCustomer * 100) / 100,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        totalRevenue: Math.round(orderTotalsData.totalRevenue * 100) / 100,
        totalOrders: orderTotalsData.totalOrders,
        maxOrdersByCustomer: maxOrders,
        maxSpentByCustomer: Math.round(maxSpent * 100) / 100,
      },
      customerBreakdown: {
        new: {
          count: newCustomersCount,
          totalSpent: Math.round(newCustomersTotalSpent * 100) / 100,
        },
        repeat: {
          count: repeatCustomersCount,
          totalSpent: Math.round(repeatCustomersTotalSpent * 100) / 100,
        },
      },
      tagsDistribution,
    };
  }

  /**
   * Upsert customer from WooCommerce data
   * Requires a valid phone number for new customers - customers without phone are not created
   */
  async upsertFromWoo(
    storeId: string,
    wooCustomer: WooCustomer,
  ): Promise<CustomerDocument | null> {
    const normalizedPhone = this.normalizePhoneNumber(
      wooCustomer.billing?.phone,
    );

    const storeObjId = new Types.ObjectId(storeId);

    // Look up by externalId first, then fall back to email/phone to avoid
    // creating duplicates when a customer was already created from an order
    let existingCustomer = await this.customerModel.findOne({
      storeId: storeObjId,
      externalId: wooCustomer.id,
    });

    if (!existingCustomer) {
      const email = wooCustomer.email?.toLowerCase();
      if (email) {
        existingCustomer = await this.customerModel.findOne({
          storeId: storeObjId,
          email,
        });
      }
      if (!existingCustomer && normalizedPhone) {
        existingCustomer = await this.customerModel.findOne({
          storeId: storeObjId,
          phone: normalizedPhone,
        });
      }
    }

    // Skip creating new customers without a phone number
    if (!existingCustomer && !normalizedPhone) {
      console.log(
        `Skipping WooCommerce customer ${wooCustomer.id} - no valid phone number`,
      );
      return null;
    }

    const customerData = {
      storeId: storeObjId,
      externalId: wooCustomer.id,
      email: wooCustomer.email?.toLowerCase(),
      firstName: wooCustomer.first_name,
      lastName: wooCustomer.last_name,
      username: wooCustomer.username,
      avatarUrl: wooCustomer.avatar_url,
      role: wooCustomer.role,
      isPayingCustomer: wooCustomer.is_paying_customer,
      billing: {
        firstName: wooCustomer.billing.first_name,
        lastName: wooCustomer.billing.last_name,
        company: wooCustomer.billing.company,
        address1: wooCustomer.billing.address_1,
        address2: wooCustomer.billing.address_2,
        city: wooCustomer.billing.city,
        state: wooCustomer.billing.state,
        postcode: wooCustomer.billing.postcode,
        country: wooCustomer.billing.country,
        email: wooCustomer.billing.email,
        phone: wooCustomer.billing.phone,
      },
      shipping: {
        firstName: wooCustomer.shipping.first_name,
        lastName: wooCustomer.shipping.last_name,
        company: wooCustomer.shipping.company,
        address1: wooCustomer.shipping.address_1,
        address2: wooCustomer.shipping.address_2,
        city: wooCustomer.shipping.city,
        state: wooCustomer.shipping.state,
        postcode: wooCustomer.shipping.postcode,
        country: wooCustomer.shipping.country,
      },
      phone: normalizedPhone,
      source: CustomerSource.WOOCOMMERCE,
      wooCreatedAt: new Date(wooCustomer.date_created),
      wooModifiedAt: new Date(wooCustomer.date_modified),
      lastSyncedAt: new Date(),
      isDeleted: false,
    };

    if (existingCustomer) {
      // Preserve internal fields
      customerData['status'] = existingCustomer.status;
      customerData['tier'] = existingCustomer.tier;
      customerData['tags'] = existingCustomer.tags;
      customerData['notes'] = existingCustomer.notes;
      customerData['stats'] = existingCustomer.stats;

      Object.assign(existingCustomer, customerData);
      await existingCustomer.save();
      return existingCustomer;
    }

    return await this.customerModel.create(customerData);
  }

  /**
   * Find or create customer from order billing info (for guest orders)
   * Finds customer by email OR phone using both customer documents and separate collections
   * This allows identifying the same customer even if they use different emails/phones across orders
   * Requires a valid phone number - customers without phone are not created
   * Customer createdAt is set to the first order date
   */
  async findOrCreateFromOrder(
    storeId: string,
    billing: {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
      address1?: string;
      address2?: string;
      city?: string;
      state?: string;
      postcode?: string;
      country?: string;
    },
    customerId = 0,
    orderDate?: Date | string,
  ): Promise<CustomerDocument | null> {
    const normalizedPhone = billing.phone
      ? this.normalizePhoneNumber(billing.phone)
      : null;
    const normalizedEmail = billing.email?.toLowerCase()?.trim() || null;

    // Skip customers without a valid phone number
    if (!normalizedPhone) {
      console.log(
        `Skipping customer creation - no valid phone number provided`,
      );
      return null;
    }

    let customer: CustomerDocument | null = null;

    // Step 1: Try to find by email in customer document
    if (normalizedEmail) {
      customer = await this.customerModel.findOne({
        storeId: new Types.ObjectId(storeId),
        email: normalizedEmail,
        isDeleted: false,
      });
    }

    // Step 2: If not found by email, try to find by primary phone in customer document
    if (!customer && normalizedPhone) {
      customer = await this.customerModel.findOne({
        storeId: new Types.ObjectId(storeId),
        phone: normalizedPhone,
        isDeleted: false,
      });

      // If found by phone and email is provided, add email to customer
      if (customer && normalizedEmail && !customer.email) {
        customer.email = normalizedEmail;
        await customer.save();
      }
    }

    // Step 3: If still not found, try to find customer via separate phone collection
    if (!customer && normalizedPhone) {
      try {
        const customerFromPhone = await this.phoneService.findCustomerByPhone(
          storeId,
          normalizedPhone,
        );
        if (customerFromPhone) {
          customer = customerFromPhone as CustomerDocument;
          // If found by phone and email is provided, add email to customer
          if (normalizedEmail && !customer.email) {
            customer.email = normalizedEmail;
            await customer.save();
          }
        }
      } catch (error) {
        // Log but continue - this is an optimization
        console.warn(
          `Failed to lookup customer by phone collection: ${error.message}`,
        );
      }
    }

    // Step 4: If still not found, try to find customer via separate email collection
    if (!customer && normalizedEmail) {
      try {
        const customerFromEmail = await this.emailService.findCustomerByEmail(
          storeId,
          normalizedEmail,
        );
        if (customerFromEmail) {
          customer = customerFromEmail as CustomerDocument;
        }
      } catch (error) {
        // Log but continue - this is an optimization
        console.warn(
          `Failed to lookup customer by email collection: ${error.message}`,
        );
      }
    }

    if (customer) {
      // Update customer with latest billing info from order
      let needsUpdate = false;

      // Update createdAt if this order is older than customer's current createdAt
      if (orderDate) {
        const orderDateTime = new Date(orderDate);
        if (orderDateTime < customer.createdAt) {
          customer.createdAt = orderDateTime;
          needsUpdate = true;
        }
      }

      // Update name if provided and different
      if (billing.firstName && billing.firstName !== customer.firstName) {
        customer.firstName = billing.firstName;
        needsUpdate = true;
      }
      if (billing.lastName && billing.lastName !== customer.lastName) {
        customer.lastName = billing.lastName;
        needsUpdate = true;
      }

      // Set primary phone if no primary exists (phones are managed in separate collection)
      if (billing.phone && !customer.phone) {
        const normalizedPhone = this.normalizePhoneNumber(billing.phone);
        if (normalizedPhone) {
          customer.phone = normalizedPhone;
          needsUpdate = true;
        }
      }

      // Always update billing address with latest
      const newBilling = {
        firstName: billing.firstName,
        lastName: billing.lastName,
        company: billing.company,
        address1: billing.address1,
        address2: billing.address2,
        city: billing.city,
        state: billing.state,
        postcode: billing.postcode,
        country: billing.country,
        email: billing.email,
        phone: billing.phone,
      };

      // Check if billing address changed
      if (JSON.stringify(customer.billing) !== JSON.stringify(newBilling)) {
        customer.billing = newBilling;
        needsUpdate = true;
      }

      // If customer was guest but now has WooCommerce account, update externalId and source
      if (customerId > 0 && customer.externalId === 0) {
        customer.externalId = customerId;
        customer.source = CustomerSource.WOOCOMMERCE;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await customer.save();
      }

      return customer;
    }

    // Create new customer from order billing (phones/emails are managed in separate collections)
    // Set createdAt to order date (customer's first order) instead of now
    customer = await this.customerModel.create({
      storeId: new Types.ObjectId(storeId),
      externalId: customerId,
      ...(normalizedEmail && { email: normalizedEmail }),
      firstName: billing.firstName,
      lastName: billing.lastName,
      phone: normalizedPhone,
      source:
        customerId > 0 ? CustomerSource.WOOCOMMERCE : CustomerSource.GUEST,
      billing: {
        firstName: billing.firstName,
        lastName: billing.lastName,
        company: billing.company,
        address1: billing.address1,
        address2: billing.address2,
        city: billing.city,
        state: billing.state,
        postcode: billing.postcode,
        country: billing.country,
        email: normalizedEmail,
        phone: normalizedPhone,
      },
      createdAt: orderDate ? new Date(orderDate) : new Date(),
      stats: {
        ordersCount: 0,
        totalSpent: 0,
      },
      isDeleted: false,
    });

    return customer;
  }

  /**
   * Merge two customers into one (when discovered to be same person)
   * Keeps the primary customer, merges data from secondary, deletes secondary
   */
  async mergeCustomers(
    primaryCustomerId: string,
    secondaryCustomerId: string,
  ): Promise<CustomerDocument> {
    const primary = await this.customerModel.findById(primaryCustomerId);
    const secondary = await this.customerModel.findById(secondaryCustomerId);

    if (!primary || !secondary) {
      throw new NotFoundException('One or both customers not found');
    }

    if (primary.storeId.toString() !== secondary.storeId.toString()) {
      throw new ForbiddenException(
        'Cannot merge customers from different stores',
      );
    }

    // Merge email (prefer primary, fallback to secondary)
    if (!primary.email && secondary.email) {
      primary.email = secondary.email;
    }

    // Merge name (prefer primary, fallback to secondary)
    if (!primary.firstName && secondary.firstName) {
      primary.firstName = secondary.firstName;
    }
    if (!primary.lastName && secondary.lastName) {
      primary.lastName = secondary.lastName;
    }

    // Set primary phone if not set
    if (!primary.phone && secondary.phone) {
      primary.phone = secondary.phone;
    }

    // Transfer phones from secondary to primary in phones collection
    try {
      const secondaryPhones = await this.phoneService.getCustomerPhones(
        secondaryCustomerId,
      );
      for (const phone of secondaryPhones) {
        await this.phoneService.transferToCustomer(
          phone._id.toString(),
          primaryCustomerId,
          'customer_merge',
        );
      }
    } catch (error) {
      console.warn(`Failed to transfer phones during merge: ${error.message}`);
    }

    // Transfer emails from secondary to primary in emails collection
    try {
      const secondaryEmails = await this.emailService.getCustomerEmails(
        secondaryCustomerId,
      );
      for (const email of secondaryEmails) {
        await this.emailService.transferToCustomer(
          email._id.toString(),
          primaryCustomerId,
          'customer_merge',
        );
      }
    } catch (error) {
      console.warn(`Failed to transfer emails during merge: ${error.message}`);
    }

    // Merge tags - combine unique tags
    const allTags = new Set([
      ...(primary.tags || []),
      ...(secondary.tags || []),
    ]);
    primary.tags = Array.from(allTags);

    // Merge notes
    primary.notes = [...(primary.notes || []), ...(secondary.notes || [])];

    // Merge stats
    primary.stats.ordersCount =
      (primary.stats.ordersCount || 0) + (secondary.stats.ordersCount || 0);
    primary.stats.totalSpent =
      (primary.stats.totalSpent || 0) + (secondary.stats.totalSpent || 0);
    if (primary.stats.ordersCount > 0) {
      primary.stats.averageOrderValue =
        primary.stats.totalSpent / primary.stats.ordersCount;
    }

    // Keep earliest first order date
    if (secondary.stats.firstOrderDate) {
      if (
        !primary.stats.firstOrderDate ||
        secondary.stats.firstOrderDate < primary.stats.firstOrderDate
      ) {
        primary.stats.firstOrderDate = secondary.stats.firstOrderDate;
      }
    }

    // Keep latest last order date
    if (secondary.stats.lastOrderDate) {
      if (
        !primary.stats.lastOrderDate ||
        secondary.stats.lastOrderDate > primary.stats.lastOrderDate
      ) {
        primary.stats.lastOrderDate = secondary.stats.lastOrderDate;
      }
    }

    // Update orders to point to primary customer
    await this.orderModel.updateMany(
      { localCustomerId: new Types.ObjectId(secondaryCustomerId) },
      { localCustomerId: new Types.ObjectId(primaryCustomerId) },
    );

    // Soft delete secondary customer
    secondary.isDeleted = true;
    await secondary.save();

    await primary.save();
    return primary;
  }

  /**
   * Verify or unverify a customer phone number (uses phones collection)
   */
  async setPhoneVerification(
    customerId: string,
    phoneNumber: string,
    isVerified: boolean,
    verifiedBy?: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      throw new NotFoundException('Invalid phone number');
    }

    // Find the phone in phones collection
    const phones = await this.phoneService.getCustomerPhones(customerId);
    const phoneRecord = phones.find((p) => p.number === normalizedPhone);
    if (!phoneRecord) {
      throw new NotFoundException('Phone number not found for this customer');
    }

    // Update verification in phones collection
    if (isVerified) {
      await this.phoneService.verify(
        phoneRecord._id.toString(),
        verifiedBy || 'system',
      );
      // Set as primary phone if verified
      customer.phone = normalizedPhone;
      await customer.save();
    } else {
      await this.phoneService.unverify(phoneRecord._id.toString());
    }

    return customer;
  }

  /**
   * Add a phone number to customer (uses phones collection)
   */
  async addPhoneNumber(
    customerId: string,
    phoneNumber: string,
    source = 'manual',
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      throw new NotFoundException('Invalid phone number');
    }

    // Add to phones collection
    await this.phoneService.findOrCreate(
      customer.storeId.toString(),
      normalizedPhone,
      customerId,
      source,
    );

    // Set as primary if no primary exists
    if (!customer.phone) {
      customer.phone = normalizedPhone;
      await customer.save();
    }

    return customer;
  }

  /**
   * Remove a phone number from customer (uses phones collection)
   */
  async removePhoneNumber(
    customerId: string,
    phoneNumber: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      throw new NotFoundException('Invalid phone number');
    }

    // Find and delete the phone from collection
    const phones = await this.phoneService.getCustomerPhones(customerId);
    const phoneRecord = phones.find((p) => p.number === normalizedPhone);
    if (phoneRecord) {
      await this.phoneService.delete(phoneRecord._id.toString());
    }

    // If removed phone was primary, set new primary from verified phones
    if (customer.phone === normalizedPhone) {
      const remainingPhones = phones.filter(
        (p) => p.number !== normalizedPhone,
      );
      const verifiedPhone = remainingPhones.find((p) => p.isVerified);
      customer.phone =
        verifiedPhone?.number || remainingPhones[0]?.number || null;
      await customer.save();
    }

    return customer;
  }

  /**
   * Set primary phone number (uses phones collection)
   */
  async setPrimaryPhone(
    customerId: string,
    phoneNumber: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      throw new NotFoundException('Invalid phone number');
    }

    // Verify phone exists in phones collection
    const phones = await this.phoneService.getCustomerPhones(customerId);
    const phoneExists = phones.some((p) => p.number === normalizedPhone);
    if (!phoneExists) {
      throw new NotFoundException('Phone number not found for this customer');
    }

    customer.phone = normalizedPhone;
    await customer.save();
    return customer;
  }

  /**
   * Export customers to CSV
   */
  async exportToCsv(userId: string, query: QueryCustomerDto): Promise<string> {
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
    if (query.source) {
      filter.source = query.source;
    }
    if (query.tier) {
      filter.tier = query.tier;
    }
    if (query.search) {
      filter.$or = [
        { email: { $regex: query.search, $options: 'i' } },
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }

    const customers = await this.customerModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(10000); // Max 10k customers

    // CSV Header
    const headers = [
      'Email',
      'First Name',
      'Last Name',
      'Phone',
      'Status',
      'Tier',
      'Orders Count',
      'Total Spent',
      'Avg Order Value',
      'First Order Date',
      'Last Order Date',
      'Billing Address',
      'Billing City',
      'Billing Country',
      'Source',
      'Created At',
      'Tags',
    ];

    // CSV Rows
    const rows = customers.map((customer) => {
      return [
        customer.email || '',
        customer.firstName || '',
        customer.lastName || '',
        customer.phone || customer.billing?.phone || '',
        customer.status || '',
        customer.tier || '',
        customer.stats?.ordersCount || 0,
        customer.stats?.totalSpent || 0,
        customer.stats?.averageOrderValue || 0,
        customer.stats?.firstOrderDate
          ? new Date(customer.stats.firstOrderDate).toISOString().split('T')[0]
          : '',
        customer.stats?.lastOrderDate
          ? new Date(customer.stats.lastOrderDate).toISOString().split('T')[0]
          : '',
        customer.billing?.address1 || '',
        customer.billing?.city || '',
        customer.billing?.country || '',
        customer.source || '',
        customer.createdAt
          ? new Date(customer.createdAt).toISOString().split('T')[0]
          : '',
        (customer.tags || []).join('; '),
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

  // ==================== Customer Segments ====================

  /**
   * Get all segments for user's stores
   */
  async getSegments(userId: string): Promise<ICustomerSegment[]> {
    const storeIds = await this.getUserStoreIds(userId);

    const segments = await this.segmentModel
      .find({
        storeId: { $in: storeIds },
        isDeleted: false,
      })
      .sort({ name: 1 });

    return segments.map((s) => this.segmentToInterface(s));
  }

  /**
   * Create a customer segment
   */
  async createSegment(
    userId: string,
    dto: CreateSegmentDto,
  ): Promise<ICustomerSegment> {
    const storeIds = await this.getUserStoreIds(userId);
    if (storeIds.length === 0) {
      throw new ForbiddenException('No store found');
    }

    // Use the first store as default (or require storeId in dto)
    const storeId = dto.storeId ? new Types.ObjectId(dto.storeId) : storeIds[0];

    const segment = await this.segmentModel.create({
      storeId,
      name: dto.name,
      description: dto.description,
      color: dto.color,
      rules: dto.rules || [],
      ruleLogic: dto.ruleLogic || 'and',
      customerCount: 0,
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });

    // Calculate initial customer count
    await this.updateSegmentCount(segment._id.toString(), userId);

    return this.segmentToInterface(segment);
  }

  /**
   * Update a customer segment
   */
  async updateSegment(
    id: string,
    userId: string,
    dto: UpdateSegmentDto,
  ): Promise<ICustomerSegment> {
    const segment = await this.segmentModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!segment) {
      throw new NotFoundException('Segment not found');
    }

    await this.verifyStoreAccess(segment.storeId.toString(), userId);

    if (dto.name !== undefined) segment.name = dto.name;
    if (dto.description !== undefined) segment.description = dto.description;
    if (dto.color !== undefined) segment.color = dto.color;
    if (dto.rules !== undefined) segment.rules = dto.rules as any;
    if (dto.ruleLogic !== undefined) segment.ruleLogic = dto.ruleLogic;

    await segment.save();

    // Recalculate customer count if rules changed
    if (dto.rules !== undefined) {
      await this.updateSegmentCount(id, userId);
    }

    return this.segmentToInterface(segment);
  }

  /**
   * Delete a customer segment
   */
  async deleteSegment(id: string, userId: string): Promise<void> {
    const segment = await this.segmentModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!segment) {
      throw new NotFoundException('Segment not found');
    }

    await this.verifyStoreAccess(segment.storeId.toString(), userId);

    segment.isDeleted = true;
    await segment.save();
  }

  /**
   * Get customers in a segment
   */
  async getSegmentCustomers(
    segmentId: string,
    userId: string,
    page = 1,
    size = 20,
  ): Promise<ICustomerResponse> {
    const segment = await this.segmentModel.findOne({
      _id: new Types.ObjectId(segmentId),
      isDeleted: false,
    });

    if (!segment) {
      throw new NotFoundException('Segment not found');
    }

    await this.verifyStoreAccess(segment.storeId.toString(), userId);

    const filter = this.buildSegmentFilter(segment);
    filter.storeId = segment.storeId;
    filter.isDeleted = false;

    const skip = (page - 1) * size;

    const [customers, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size),
      this.customerModel.countDocuments(filter),
    ]);

    return {
      customers: customers.map((c) => this.toInterface(c)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Update segment customer count
   */
  async updateSegmentCount(segmentId: string, userId: string): Promise<number> {
    const segment = await this.segmentModel.findById(segmentId);
    if (!segment) return 0;

    const filter = this.buildSegmentFilter(segment);
    filter.storeId = segment.storeId;
    filter.isDeleted = false;

    const count = await this.customerModel.countDocuments(filter);

    segment.customerCount = count;
    segment.lastCountUpdated = new Date();
    await segment.save();

    return count;
  }

  /**
   * Build MongoDB filter from segment rules
   */
  private buildSegmentFilter(segment: CustomerSegmentDocument): any {
    if (!segment.rules || segment.rules.length === 0) {
      return {};
    }

    const conditions = segment.rules.map((rule) => {
      const { field, operator, value } = rule;

      switch (operator) {
        case 'eq':
          return { [field]: value };
        case 'ne':
          return { [field]: { $ne: value } };
        case 'gt':
          return { [field]: { $gt: value } };
        case 'gte':
          return { [field]: { $gte: value } };
        case 'lt':
          return { [field]: { $lt: value } };
        case 'lte':
          return { [field]: { $lte: value } };
        case 'contains':
          return { [field]: { $regex: value, $options: 'i' } };
        case 'in':
          return { [field]: { $in: Array.isArray(value) ? value : [value] } };
        default:
          return { [field]: value };
      }
    });

    if (segment.ruleLogic === 'or') {
      return { $or: conditions };
    }

    return { $and: conditions };
  }

  private segmentToInterface(doc: CustomerSegmentDocument): ICustomerSegment {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      name: obj.name,
      description: obj.description,
      color: obj.color,
      rules: obj.rules || [],
      ruleLogic: obj.ruleLogic || 'and',
      customerCount: obj.customerCount || 0,
      lastCountUpdated: obj.lastCountUpdated,
      createdBy: obj.createdBy?.toString(),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private toInterface(doc: CustomerDocument): ICustomer {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      externalId: obj.externalId,
      storeId: obj.storeId.toString(),
      email: obj.email,
      firstName: obj.firstName,
      lastName: obj.lastName,
      username: obj.username,
      phone: obj.phone,
      avatarUrl: obj.avatarUrl,
      billing: obj.billing,
      shipping: obj.shipping,
      status: obj.status,
      source: obj.source,
      tier: obj.tier,
      stats: obj.stats || { ordersCount: 0, totalSpent: 0 },
      role: obj.role,
      isPayingCustomer: obj.isPayingCustomer,
      wooCreatedAt: obj.wooCreatedAt,
      wooModifiedAt: obj.wooModifiedAt,
      tags: obj.tags || [],
      notes: (obj.notes || []).map((n: any) => ({
        _id: n._id.toString(),
        content: n.content,
        addedBy: n.addedBy,
        addedByUserId: n.addedByUserId?.toString(),
        createdAt: n.createdAt,
      })),
      isDeleted: obj.isDeleted,
      lastSyncedAt: obj.lastSyncedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
