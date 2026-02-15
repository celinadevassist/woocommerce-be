import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../order/schema';
import { Customer, CustomerDocument } from '../customer/schema';
import { Product, ProductDocument } from '../product/schema';
import { Review, ReviewDocument } from '../review/schema';
import { Store, StoreDocument } from '../store/schema';
import { QueryAnalyticsDto } from './dto.query';
import {
  IDashboardAnalytics,
  IAnalyticsSummary,
  IRevenueData,
  ITopProduct,
  ITopCustomer,
  IOrdersByStatus,
  IRevenueByStore,
} from './interface';
import { ReviewStatus } from '../review/enum';

// Statuses that should not count toward revenue/financial metrics
const EXCLUDED_REVENUE_STATUSES = ['cancelled', 'refunded', 'failed'];

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  /**
   * Get dashboard analytics
   */
  async getDashboard(
    userId: string,
    query: QueryAnalyticsDto,
  ): Promise<IDashboardAnalytics> {
    const storeIds = await this.getUserStoreIds(userId);

    const baseFilter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (query.storeId) {
      // Verify user has access to this specific store
      await this.getStoreWithAccess(query.storeId, userId);
      baseFilter.storeId = new Types.ObjectId(query.storeId);
    }

    // Date range filter
    const dateFilter: any = {};
    if (query.startDate) {
      dateFilter.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      dateFilter.$lte = new Date(query.endDate);
    }

    const [
      summary,
      revenueOverTime,
      topProducts,
      topCustomers,
      ordersByStatus,
      revenueByStore,
      recentOrders,
      recentReviews,
    ] = await Promise.all([
      this.getSummary(baseFilter, dateFilter),
      this.getRevenueOverTime(baseFilter, dateFilter, query.period || 'month'),
      this.getTopProducts(baseFilter, dateFilter),
      this.getTopCustomers(baseFilter, dateFilter),
      this.getOrdersByStatus(baseFilter, dateFilter),
      this.getRevenueByStore(storeIds, dateFilter),
      this.getRecentOrders(baseFilter),
      this.getRecentReviews(baseFilter),
    ]);

    return {
      summary,
      revenueOverTime,
      topProducts,
      topCustomers,
      ordersByStatus,
      revenueByStore,
      recentOrders,
      recentReviews,
    };
  }

  /**
   * Get summary statistics
   */
  private async getSummary(
    baseFilter: any,
    dateFilter: any,
  ): Promise<IAnalyticsSummary> {
    const orderFilter = { ...baseFilter };
    if (Object.keys(dateFilter).length > 0) {
      orderFilter.dateCreatedWoo = dateFilter;
    }

    const productFilter = { ...baseFilter };
    delete productFilter.isDeleted;
    productFilter.deletedAt = { $exists: false };

    const revenueFilter = { ...orderFilter, status: { $nin: EXCLUDED_REVENUE_STATUSES } };

    const [
      totalOrders,
      validOrderCount,
      revenueData,
      refundsData,
      ordersByStatus,
      totalCustomers,
      newCustomers,
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      totalReviews,
      avgRating,
      pendingReviews,
    ] = await Promise.all([
      // Total orders including all statuses (for the "Total Orders" card)
      this.orderModel.countDocuments(orderFilter),
      // Valid order count excluding cancelled/refunded/failed (for average calculation)
      this.orderModel.countDocuments(revenueFilter),
      // Gross revenue from valid orders only
      this.orderModel.aggregate([
        { $match: revenueFilter },
        { $group: { _id: null, total: { $sum: { $toDouble: '$total' } } } },
      ]),
      // Total refunds to deduct from revenue (only from valid orders, not fully-refunded/cancelled/failed)
      this.orderModel.aggregate([
        { $match: revenueFilter },
        { $unwind: { path: '$refunds', preserveNullAndEmptyArrays: false } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$refunds.total' } } } },
      ]),
      this.orderModel.aggregate([
        { $match: orderFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.customerModel.countDocuments(baseFilter),
      this.customerModel.countDocuments({
        ...baseFilter,
        ...(Object.keys(dateFilter).length > 0
          ? { createdAt: dateFilter }
          : {}),
      }),
      this.productModel.countDocuments(productFilter),
      this.productModel.countDocuments({
        ...productFilter,
        'inventory.quantity': { $gt: 0, $lte: 10 },
      }),
      this.productModel.countDocuments({
        ...productFilter,
        'inventory.quantity': { $lte: 0 },
      }),
      this.reviewModel.countDocuments(baseFilter),
      this.reviewModel.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, avg: { $avg: '$rating' } } },
      ]),
      this.reviewModel.countDocuments({
        ...baseFilter,
        status: ReviewStatus.HOLD,
      }),
    ]);

    const grossRevenue = revenueData[0]?.total || 0;
    const totalRefunds = refundsData[0]?.total || 0;
    const netRevenue = grossRevenue - totalRefunds;

    const statusMap: Record<string, number> = {};
    ordersByStatus.forEach((item: any) => {
      statusMap[item._id] = item.count;
    });

    return {
      orders: {
        total: totalOrders,
        revenue: netRevenue,
        averageOrderValue:
          validOrderCount > 0 ? netRevenue / validOrderCount : 0,
        byStatus: statusMap,
      },
      customers: {
        total: totalCustomers,
        new: newCustomers,
        returning: totalCustomers - newCustomers,
      },
      products: {
        total: totalProducts,
        lowStock: lowStockProducts,
        outOfStock: outOfStockProducts,
      },
      reviews: {
        total: totalReviews,
        averageRating: Math.round((avgRating[0]?.avg || 0) * 10) / 10,
        pending: pendingReviews,
      },
    };
  }

  /**
   * Get revenue over time
   */
  private async getRevenueOverTime(
    baseFilter: any,
    dateFilter: any,
    period: string,
  ): Promise<IRevenueData[]> {
    const orderFilter = {
      ...baseFilter,
      dateCreatedWoo: { $exists: true, $ne: null },
    };
    if (Object.keys(dateFilter).length > 0) {
      orderFilter.dateCreatedWoo = {
        ...orderFilter.dateCreatedWoo,
        ...dateFilter,
      };
    }

    let dateFormat: string;
    switch (period) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%V';
        break;
      case 'year':
        dateFormat = '%Y';
        break;
      default:
        dateFormat = '%Y-%m';
    }

    const revenueFilter = { ...orderFilter, status: { $nin: EXCLUDED_REVENUE_STATUSES } };
    const result = await this.orderModel.aggregate([
      { $match: revenueFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: dateFormat, date: '$dateCreatedWoo' },
          },
          revenue: { $sum: { $toDouble: '$total' } },
          orders: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } }, // Filter out any null groupings
      { $sort: { _id: -1 } }, // Sort descending to get most recent
      { $limit: 12 },
      { $sort: { _id: 1 } }, // Sort ascending for proper chart display
    ]);

    return result.map((item: any) => ({
      date: item._id,
      revenue: item.revenue,
      orders: item.orders,
    }));
  }

  /**
   * Get top selling products
   */
  private async getTopProducts(
    baseFilter: any,
    dateFilter: any,
  ): Promise<ITopProduct[]> {
    const orderFilter = { ...baseFilter };
    if (Object.keys(dateFilter).length > 0) {
      orderFilter.dateCreatedWoo = dateFilter;
    }

    const revenueFilter = { ...orderFilter, status: { $nin: EXCLUDED_REVENUE_STATUSES } };
    const result = await this.orderModel.aggregate([
      { $match: revenueFilter },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          name: { $first: '$lineItems.name' },
          quantity: { $sum: '$lineItems.quantity' },
          revenue: { $sum: { $toDouble: '$lineItems.total' } },
        },
      },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 20 },
    ]);

    // Get product images
    const productIds = result.map((r: any) => r._id).filter(Boolean);
    const products = await this.productModel.find({
      externalId: { $in: productIds },
    });
    const productMap = new Map(products.map((p) => [p.externalId, p]));

    return result.map((item: any) => {
      const product = productMap.get(item._id);
      return {
        productId: item._id?.toString() || 'unknown',
        name: item.name || 'Unknown Product',
        image: product?.images?.[0]?.src,
        quantity: item.quantity,
        revenue: item.revenue,
      };
    });
  }

  /**
   * Get top customers
   */
  private async getTopCustomers(
    baseFilter: any,
    dateFilter: any,
  ): Promise<ITopCustomer[]> {
    const orderFilter = { ...baseFilter };
    if (Object.keys(dateFilter).length > 0) {
      orderFilter.dateCreatedWoo = dateFilter;
    }

    const revenueFilter = { ...orderFilter, status: { $nin: EXCLUDED_REVENUE_STATUSES } };
    const result = await this.orderModel.aggregate([
      { $match: revenueFilter },
      {
        $group: {
          _id: '$billing.email',
          name: {
            $first: {
              $concat: ['$billing.firstName', ' ', '$billing.lastName'],
            },
          },
          ordersCount: { $sum: 1 },
          totalSpent: { $sum: { $toDouble: '$total' } },
        },
      },
      { $sort: { ordersCount: -1, totalSpent: -1 } },
      { $limit: 20 },
    ]);

    return result.map((item: any) => ({
      customerId: item._id,
      name: item.name?.trim() || 'Guest',
      email: item._id || '',
      ordersCount: item.ordersCount,
      totalSpent: item.totalSpent,
    }));
  }

  /**
   * Get orders by status
   */
  private async getOrdersByStatus(
    baseFilter: any,
    dateFilter: any,
  ): Promise<IOrdersByStatus[]> {
    const orderFilter = { ...baseFilter };
    if (Object.keys(dateFilter).length > 0) {
      orderFilter.dateCreatedWoo = dateFilter;
    }

    const result = await this.orderModel.aggregate([
      { $match: orderFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return result.map((item: any) => ({
      status: item._id,
      count: item.count,
    }));
  }

  /**
   * Get revenue by store
   */
  private async getRevenueByStore(
    storeIds: Types.ObjectId[],
    dateFilter: any,
  ): Promise<IRevenueByStore[]> {
    const orderFilter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };
    if (Object.keys(dateFilter).length > 0) {
      orderFilter.dateCreatedWoo = dateFilter;
    }

    const revenueFilter = { ...orderFilter, status: { $nin: EXCLUDED_REVENUE_STATUSES } };
    const result = await this.orderModel.aggregate([
      { $match: revenueFilter },
      {
        $group: {
          _id: '$storeId',
          revenue: { $sum: { $toDouble: '$total' } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    // Get store names
    const resultStoreIds = result.map((r: any) => r._id);
    const stores = await this.storeModel.find({ _id: { $in: resultStoreIds } });
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));

    return result.map((item: any) => {
      const store = storeMap.get(item._id.toString());
      return {
        storeId: item._id.toString(),
        storeName: store?.name || 'Unknown Store',
        revenue: item.revenue,
        orders: item.orders,
      };
    });
  }

  /**
   * Get recent orders
   */
  private async getRecentOrders(baseFilter: any): Promise<any[]> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const orders = await this.orderModel
      .find({ ...baseFilter, dateCreatedWoo: { $gte: weekAgo } })
      .sort({ dateCreatedWoo: -1 });

    return orders.map((order) => ({
      _id: order._id.toString(),
      orderNumber: order.orderNumber,
      customer: `${order.billing.firstName} ${order.billing.lastName}`.trim(),
      total: order.total,
      status: order.status,
      date: order.dateCreatedWoo,
    }));
  }

  /**
   * Get recent reviews
   */
  private async getRecentReviews(baseFilter: any): Promise<any[]> {
    const reviews = await this.reviewModel
      .find(baseFilter)
      .sort({ wooCreatedAt: -1 })
      .limit(5);

    return reviews.map((review) => ({
      _id: review._id.toString(),
      reviewer: review.reviewer,
      rating: review.rating,
      review:
        review.review?.substring(0, 100) +
        (review.review?.length > 100 ? '...' : ''),
      status: review.status,
      date: review.wooCreatedAt,
    }));
  }

  // Helper methods
  private async getUserStoreIds(userId: string): Promise<Types.ObjectId[]> {
    const stores = await this.storeModel.find({
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });
    return stores.map((store) => store._id);
  }

  private async getStoreWithAccess(
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

    const isOwner = store.ownerId?.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }
}
