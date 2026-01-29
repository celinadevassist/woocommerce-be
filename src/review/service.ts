import { Injectable, Logger } from '@nestjs/common';
import {
  ResourceNotFoundException,
  AccessDeniedException,
  ValidationException,
} from '../shared/exceptions';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schema';
import {
  ResponseTemplate,
  ResponseTemplateDocument,
} from './response-template.schema';
import { UpdateReviewDto, ReplyReviewDto } from './dto.update';
import { QueryReviewDto } from './dto.query';
import { CreateReviewDto } from './dto.create';
import {
  CreateResponseTemplateDto,
  UpdateResponseTemplateDto,
  IResponseTemplate,
} from './response-template.dto';
import {
  IReview,
  IReviewResponse,
  IReviewStats,
  IReviewPhoto,
} from './interface';
import {
  ReviewStatus,
  ReviewSource,
  ReviewType,
  ModerationStatus,
} from './enum';
import { Product, ProductDocument } from '../product/schema';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooProductReview } from '../integrations/woocommerce/woocommerce.types';
import {
  S3UploadService,
  UploadedFile,
} from '../modules/s3-upload/s3-upload.service';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(ResponseTemplate.name)
    private responseTemplateModel: Model<ResponseTemplateDocument>,
    private readonly wooCommerceService: WooCommerceService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  /**
   * Get all store IDs the user has access to (owner or member)
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
      throw new ResourceNotFoundException('Store', storeId);
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new AccessDeniedException('store', 'user is not owner or member');
    }

    return store;
  }

  /**
   * Get reviews with filtering and pagination
   */
  async findAll(
    userId: string,
    query: QueryReviewDto,
  ): Promise<IReviewResponse> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    // Apply filters
    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.productId) {
      filter.localProductId = new Types.ObjectId(query.productId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.minRating !== undefined || query.maxRating !== undefined) {
      filter.rating = {};
      if (query.minRating !== undefined) filter.rating.$gte = query.minRating;
      if (query.maxRating !== undefined) filter.rating.$lte = query.maxRating;
    }
    if (query.verified !== undefined) {
      filter.verified = query.verified;
    }
    if (query.hasReply !== undefined) {
      if (query.hasReply) {
        filter.$and = [
          { reply: { $exists: true } },
          { reply: { $ne: null } },
          { reply: { $ne: '' } },
        ];
      } else {
        filter.$or = [
          { reply: { $exists: false } },
          { reply: null },
          { reply: '' },
        ];
      }
    }
    if (query.isFlagged !== undefined) {
      filter.isFlagged = query.isFlagged;
    }
    if (query.reviewType) {
      filter.reviewType = query.reviewType;
    }
    if (query.source) {
      filter.source = query.source;
    }
    if (query.moderationStatus) {
      filter.moderationStatus = query.moderationStatus;
    }
    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }
    if (query.isFeatured !== undefined) {
      filter.isFeatured = query.isFeatured;
    }
    if (query.reviewerEmail) {
      filter.reviewerEmail = { $regex: query.reviewerEmail, $options: 'i' };
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }
    if (query.search) {
      filter.$or = [
        { reviewer: { $regex: query.search, $options: 'i' } },
        { review: { $regex: query.search, $options: 'i' } },
        { reviewerEmail: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [reviews, total] = await Promise.all([
      this.reviewModel.find(filter).sort(sort).skip(skip).limit(size),
      this.reviewModel.countDocuments(filter),
    ]);

    // Fetch product info for reviews
    const productIds = [
      ...new Set(
        reviews.map((r) => r.localProductId?.toString()).filter(Boolean),
      ),
    ];
    const products =
      productIds.length > 0
        ? await this.productModel.find({ _id: { $in: productIds } })
        : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    return {
      reviews: reviews.map((r) => {
        const product = r.localProductId
          ? productMap.get(r.localProductId.toString())
          : null;
        return this.toInterface(r, product);
      }),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get review by ID
   */
  async findById(id: string, userId: string): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', id);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    const product = review.localProductId
      ? await this.productModel.findById(review.localProductId)
      : null;

    return this.toInterface(review, product);
  }

  /**
   * Update review (status, flags, notes)
   * Optionally syncs status changes back to WooCommerce
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateReviewDto,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', id);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    const oldStatus = review.status;
    const statusChanged = dto.status && dto.status !== oldStatus;

    // Update fields
    if (dto.status) review.status = dto.status;
    if (dto.tags) review.tags = dto.tags;
    if (dto.internalNotes !== undefined)
      review.internalNotes = dto.internalNotes;
    if (dto.isFlagged !== undefined) review.isFlagged = dto.isFlagged;
    if (dto.flagReason !== undefined) review.flagReason = dto.flagReason;

    await review.save();

    // Sync status change to WooCommerce if requested (default: true)
    if (statusChanged && dto.syncToStore !== false && review.externalId) {
      try {
        await this.syncReviewStatusToWoo(review);
        this.logger.log(
          `Review ${review.externalId} status synced to WooCommerce: ${dto.status}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to sync review status to WooCommerce: ${error.message}`,
        );
        // Don't throw - local update succeeded, just log the sync failure
      }
    }

    // Sync product rating when review status changes (affects which reviews are counted)
    if (statusChanged && review.localProductId) {
      await this.syncProductRating(review.localProductId.toString()).catch(
        (err) => {
          this.logger.error(`Failed to sync product rating: ${err.message}`);
        },
      );
    }

    return this.toInterface(review);
  }

  /**
   * Sync review status to WooCommerce
   */
  private async syncReviewStatusToWoo(review: ReviewDocument): Promise<void> {
    const store = await this.storeModel.findById(review.storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    await this.wooCommerceService.updateReview(credentials, review.externalId, {
      status: review.status,
    });
  }

  /**
   * Reply to a review
   */
  async reply(
    id: string,
    userId: string,
    dto: ReplyReviewDto,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', id);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.reply = dto.reply;
    review.repliedAt = new Date();
    review.repliedBy = new Types.ObjectId(userId) as any;

    await review.save();
    return this.toInterface(review);
  }

  /**
   * Get new reviews count (reviews from the last 24 hours that are pending)
   */
  async getNewReviewsCount(
    userId: string,
    storeId?: string,
  ): Promise<{ count: number; reviews: IReview[] }> {
    const storeIds = await this.getUserStoreIds(userId);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
      wooCreatedAt: { $gte: twentyFourHoursAgo },
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    const reviews = await this.reviewModel
      .find(filter)
      .sort({ wooCreatedAt: -1 })
      .limit(10);

    // Get product info
    const productIds = [
      ...new Set(
        reviews.map((r) => r.localProductId?.toString()).filter(Boolean),
      ),
    ];
    const products =
      productIds.length > 0
        ? await this.productModel.find({ _id: { $in: productIds } })
        : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const count = await this.reviewModel.countDocuments(filter);

    return {
      count,
      reviews: reviews.map((r) => {
        const product = r.localProductId
          ? productMap.get(r.localProductId.toString())
          : null;
        return this.toInterface(r, product);
      }),
    };
  }

  /**
   * Get review statistics
   */
  async getStats(userId: string, storeId?: string): Promise<IReviewStats> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    const [
      totalReviews,
      pendingReviews,
      verifiedReviews,
      repliedReviews,
      avgRating,
      ratingDist,
      recentReviews,
    ] = await Promise.all([
      this.reviewModel.countDocuments(filter),
      this.reviewModel.countDocuments({ ...filter, status: ReviewStatus.HOLD }),
      this.reviewModel.countDocuments({ ...filter, verified: true }),
      this.reviewModel.countDocuments({
        ...filter,
        reply: { $exists: true },
        $and: [{ reply: { $ne: null } }, { reply: { $ne: '' } }],
      }),
      this.reviewModel.aggregate([
        { $match: filter },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
      this.reviewModel.aggregate([
        { $match: filter },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
      this.reviewModel.find(filter).sort({ createdAt: -1 }).limit(5),
    ]);

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingDist.forEach((item: any) => {
      if (item._id >= 1 && item._id <= 5) {
        ratingDistribution[item._id as 1 | 2 | 3 | 4 | 5] = item.count;
      }
    });

    return {
      totalReviews,
      averageRating: Math.round((avgRating[0]?.avgRating || 0) * 10) / 10,
      ratingDistribution,
      pendingReviews,
      verifiedReviews,
      repliedReviews,
      recentReviews: recentReviews.map((r) => this.toInterface(r)),
    };
  }

  /**
   * Get reviews for a specific product
   */
  async getProductReviews(
    productId: string,
    page = 1,
    size = 10,
  ): Promise<IReviewResponse> {
    const filter = {
      localProductId: new Types.ObjectId(productId),
      status: ReviewStatus.APPROVED,
      isDeleted: false,
    };

    const skip = (page - 1) * size;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size),
      this.reviewModel.countDocuments(filter),
    ]);

    return {
      reviews: reviews.map((r) => this.toInterface(r)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get review count by store
   */
  async getReviewCountByStore(storeId: string): Promise<number> {
    return this.reviewModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  /**
   * Get review analytics and trends
   */
  async getAnalytics(
    userId: string,
    storeId?: string,
    period: 'week' | 'month' | 'quarter' | 'year' = 'month',
  ): Promise<{
    trends: {
      date: string;
      count: number;
      avgRating: number;
      positiveCount: number;
      negativeCount: number;
    }[];
    ratingTrends: {
      date: string;
      rating1: number;
      rating2: number;
      rating3: number;
      rating4: number;
      rating5: number;
    }[];
    responseMetrics: {
      totalReviews: number;
      repliedCount: number;
      responseRate: number;
      avgResponseTime: number | null;
    };
    topProducts: {
      productId: string;
      productName: string;
      reviewCount: number;
      avgRating: number;
    }[];
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
    reviewsByDayOfWeek: { day: string; count: number }[];
    verificationStats: { verified: number; unverified: number };
  }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let groupFormat: string;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupFormat = '%Y-%m-%d';
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        groupFormat = '%Y-%m-%d';
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        groupFormat = '%Y-%U'; // Week of year
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        groupFormat = '%Y-%m'; // Month
        break;
    }

    const dateFilter = { ...filter, wooCreatedAt: { $gte: startDate } };

    // 1. Review trends over time
    const trends = await this.reviewModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: groupFormat, date: '$wooCreatedAt' },
          },
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          positiveCount: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
          negativeCount: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 2. Rating distribution trends
    const ratingTrends = await this.reviewModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: groupFormat, date: '$wooCreatedAt' },
          },
          rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 3. Response metrics
    const [totalReviews, repliedCount, avgResponseTimeResult] =
      await Promise.all([
        this.reviewModel.countDocuments(filter),
        this.reviewModel.countDocuments({
          ...filter,
          reply: { $exists: true, $nin: [null, ''] },
        }),
        this.reviewModel.aggregate([
          {
            $match: {
              ...filter,
              reply: { $exists: true, $nin: [null, ''] },
              repliedAt: { $exists: true },
              wooCreatedAt: { $exists: true },
            },
          },
          {
            $project: {
              responseTime: { $subtract: ['$repliedAt', '$wooCreatedAt'] },
            },
          },
          {
            $group: {
              _id: null,
              avgResponseTime: { $avg: '$responseTime' },
            },
          },
        ]),
      ]);

    const responseMetrics = {
      totalReviews,
      repliedCount,
      responseRate:
        totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0,
      avgResponseTime: avgResponseTimeResult[0]?.avgResponseTime
        ? Math.round(
            avgResponseTimeResult[0].avgResponseTime / (1000 * 60 * 60),
          ) // Hours
        : null,
    };

    // 4. Top reviewed products
    const topProductsAgg = await this.reviewModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$localProductId',
          reviewCount: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { reviewCount: -1 } },
      { $limit: 10 },
    ]);

    const productIds = topProductsAgg.map((p) => p._id).filter(Boolean);
    const products =
      productIds.length > 0
        ? await this.productModel.find({ _id: { $in: productIds } })
        : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p.name]));

    const topProducts = topProductsAgg
      .filter((p) => p._id)
      .map((p) => ({
        productId: p._id.toString(),
        productName: productMap.get(p._id.toString()) || 'Unknown Product',
        reviewCount: p.reviewCount,
        avgRating: Math.round(p.avgRating * 10) / 10,
      }));

    // 5. Sentiment breakdown (based on rating)
    const sentimentAgg = await this.reviewModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          positive: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } },
        },
      },
    ]);

    const sentimentBreakdown = sentimentAgg[0] || {
      positive: 0,
      neutral: 0,
      negative: 0,
    };

    // 6. Reviews by day of week
    const dayOfWeekAgg = await this.reviewModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dayOfWeek: '$wooCreatedAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const reviewsByDayOfWeek = dayOfWeekAgg.map((d) => ({
      day: dayNames[d._id - 1] || 'Unknown',
      count: d.count,
    }));

    // 7. Verification stats
    const [verified, unverified] = await Promise.all([
      this.reviewModel.countDocuments({ ...filter, verified: true }),
      this.reviewModel.countDocuments({ ...filter, verified: false }),
    ]);

    return {
      trends: trends.map((t) => ({
        date: t._id,
        count: t.count,
        avgRating: Math.round(t.avgRating * 10) / 10,
        positiveCount: t.positiveCount,
        negativeCount: t.negativeCount,
      })),
      ratingTrends: ratingTrends.map((t) => ({
        date: t._id,
        rating1: t.rating1,
        rating2: t.rating2,
        rating3: t.rating3,
        rating4: t.rating4,
        rating5: t.rating5,
      })),
      responseMetrics,
      topProducts,
      sentimentBreakdown,
      reviewsByDayOfWeek,
      verificationStats: { verified, unverified },
    };
  }

  /**
   * Export reviews to CSV
   */
  async exportToCsv(userId: string, query: QueryReviewDto): Promise<string> {
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
    if (query.minRating !== undefined) {
      filter.rating = { ...filter.rating, $gte: query.minRating };
    }
    if (query.maxRating !== undefined) {
      filter.rating = { ...filter.rating, $lte: query.maxRating };
    }
    if (query.verified !== undefined) {
      filter.verified = query.verified;
    }
    if (query.search) {
      filter.$or = [
        { reviewer: { $regex: query.search, $options: 'i' } },
        { review: { $regex: query.search, $options: 'i' } },
      ];
    }

    const reviews = await this.reviewModel
      .find(filter)
      .sort({ wooCreatedAt: -1 })
      .limit(10000); // Max 10k reviews

    // Get product names
    const productIds = [
      ...new Set(
        reviews.map((r) => r.localProductId?.toString()).filter(Boolean),
      ),
    ];
    const products =
      productIds.length > 0
        ? await this.productModel.find({ _id: { $in: productIds } })
        : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p.name]));

    // CSV Header
    const headers = [
      'Reviewer',
      'Email',
      'Product',
      'Rating',
      'Review',
      'Status',
      'Verified',
      'Reply',
      'Date',
      'Tags',
    ];

    // CSV Rows
    const rows = reviews.map((review) => {
      const productName = review.localProductId
        ? productMap.get(review.localProductId.toString()) || ''
        : '';
      return [
        review.reviewer || '',
        review.reviewerEmail || '',
        productName,
        review.rating,
        review.review || '',
        review.status || '',
        review.verified ? 'Yes' : 'No',
        review.reply || '',
        review.wooCreatedAt
          ? new Date(review.wooCreatedAt).toISOString().split('T')[0]
          : '',
        (review.tags || []).join('; '),
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
   * Upsert review from WooCommerce data
   */
  async upsertFromWoo(
    storeId: string,
    wooReview: WooProductReview,
  ): Promise<ReviewDocument> {
    const existingReview = await this.reviewModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: wooReview.id,
    });

    // Find local product by external ID
    const product = await this.productModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: wooReview.product_id,
    });

    const statusMap: Record<string, ReviewStatus> = {
      approved: ReviewStatus.APPROVED,
      hold: ReviewStatus.HOLD,
      spam: ReviewStatus.SPAM,
      trash: ReviewStatus.TRASH,
    };

    const reviewData = {
      storeId: new Types.ObjectId(storeId),
      externalId: wooReview.id,
      productExternalId: wooReview.product_id,
      localProductId: product?._id,
      reviewer: wooReview.reviewer,
      reviewerEmail: wooReview.reviewer_email.toLowerCase(),
      review: wooReview.review,
      rating: wooReview.rating,
      verified: wooReview.verified,
      status: statusMap[wooReview.status] || ReviewStatus.APPROVED,
      source: ReviewSource.WOOCOMMERCE,
      wooCreatedAt: new Date(wooReview.date_created),
      lastSyncedAt: new Date(),
      isDeleted: false,
    };

    if (existingReview) {
      // Preserve internal fields
      reviewData['reply'] = existingReview.reply;
      reviewData['repliedAt'] = existingReview.repliedAt;
      reviewData['repliedBy'] = existingReview.repliedBy;
      reviewData['tags'] = existingReview.tags;
      reviewData['internalNotes'] = existingReview.internalNotes;
      reviewData['isFlagged'] = existingReview.isFlagged;
      reviewData['flagReason'] = existingReview.flagReason;

      Object.assign(existingReview, reviewData);
      await existingReview.save();

      // Sync rating to product after review update
      if (product) {
        await this.syncProductRating(product._id.toString()).catch((err) => {
          this.logger.error(`Failed to sync product rating: ${err.message}`);
        });
      }

      return existingReview;
    }

    const newReview = await this.reviewModel.create(reviewData);

    // Sync rating to product after new review
    if (product) {
      await this.syncProductRating(product._id.toString()).catch((err) => {
        this.logger.error(`Failed to sync product rating: ${err.message}`);
      });
    }

    return newReview;
  }

  // ==================== Response Templates ====================

  /**
   * Get all response templates for user's stores
   */
  async getResponseTemplates(
    userId: string,
    storeId?: string,
    category?: string,
  ): Promise<IResponseTemplate[]> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    if (category) {
      filter.category = category;
    }

    const templates = await this.responseTemplateModel
      .find(filter)
      .sort({ usageCount: -1, name: 1 });

    return templates.map((t) => this.templateToInterface(t));
  }

  /**
   * Create a response template
   */
  async createResponseTemplate(
    userId: string,
    storeId: string,
    dto: CreateResponseTemplateDto,
  ): Promise<IResponseTemplate> {
    // Verify user has access to the store
    await this.verifyStoreAccess(storeId, userId);

    const template = await this.responseTemplateModel.create({
      storeId: new Types.ObjectId(storeId),
      name: dto.name,
      content: dto.content,
      category: dto.category || 'general',
      createdBy: new Types.ObjectId(userId),
      usageCount: 0,
      isDeleted: false,
    });

    return this.templateToInterface(template);
  }

  /**
   * Update a response template
   */
  async updateResponseTemplate(
    id: string,
    userId: string,
    dto: UpdateResponseTemplateDto,
  ): Promise<IResponseTemplate> {
    const template = await this.responseTemplateModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!template) {
      throw new ResourceNotFoundException('ResponseTemplate', id);
    }

    await this.verifyStoreAccess(template.storeId.toString(), userId);

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.content !== undefined) template.content = dto.content;
    if (dto.category !== undefined) template.category = dto.category;

    await template.save();
    return this.templateToInterface(template);
  }

  /**
   * Delete a response template
   */
  async deleteResponseTemplate(id: string, userId: string): Promise<void> {
    const template = await this.responseTemplateModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!template) {
      throw new ResourceNotFoundException('ResponseTemplate', id);
    }

    await this.verifyStoreAccess(template.storeId.toString(), userId);

    template.isDeleted = true;
    await template.save();
  }

  /**
   * Increment template usage count
   */
  async incrementTemplateUsage(id: string): Promise<void> {
    await this.responseTemplateModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $inc: { usageCount: 1 } },
    );
  }

  // ==================== Rating Sync to Products ====================

  /**
   * Sync average rating from reviews to a specific product
   */
  async syncProductRating(
    productId: string,
  ): Promise<{ averageRating: number; ratingCount: number }> {
    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new ResourceNotFoundException('Product', productId);
    }

    // Calculate rating stats from approved reviews only
    const ratingStats = await this.reviewModel.aggregate([
      {
        $match: {
          localProductId: new Types.ObjectId(productId),
          status: ReviewStatus.APPROVED,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          ratingCount: { $sum: 1 },
        },
      },
    ]);

    const stats = ratingStats[0] || { averageRating: 0, ratingCount: 0 };
    const averageRating = Math.round((stats.averageRating || 0) * 10) / 10;
    const ratingCount = stats.ratingCount || 0;

    // Update product
    await this.productModel.updateOne(
      { _id: productId },
      { averageRating, ratingCount },
    );

    this.logger.log(
      `Product ${productId} rating synced: ${averageRating} (${ratingCount} reviews)`,
    );

    return { averageRating, ratingCount };
  }

  /**
   * Sync average rating by product external ID (used during WooCommerce sync)
   */
  async syncProductRatingByExternalId(
    storeId: string,
    productExternalId: number,
  ): Promise<void> {
    const product = await this.productModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: productExternalId,
    });

    if (product) {
      await this.syncProductRating(product._id.toString());
    }
  }

  /**
   * Sync ratings for all products in a store
   */
  async syncAllProductRatings(
    userId: string,
    storeId?: string,
  ): Promise<{ updated: number }> {
    const storeIds = await this.getUserStoreIds(userId);

    const productFilter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      productFilter.storeId = new Types.ObjectId(storeId);
    }

    const products = await this.productModel.find(productFilter, '_id');

    let updated = 0;
    for (const product of products) {
      try {
        await this.syncProductRating(product._id.toString());
        updated++;
      } catch (error) {
        this.logger.error(
          `Failed to sync rating for product ${product._id}: ${error.message}`,
        );
      }
    }

    this.logger.log(`Synced ratings for ${updated} products`);
    return { updated };
  }

  private templateToInterface(
    doc: ResponseTemplateDocument,
  ): IResponseTemplate {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      name: obj.name,
      content: obj.content,
      category: obj.category,
      usageCount: obj.usageCount,
      createdBy: obj.createdBy?.toString(),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private toInterface(
    doc: ReviewDocument,
    product?: ProductDocument | null,
  ): IReview {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      externalId: obj.externalId,
      storeId: obj.storeId.toString(),
      productExternalId: obj.productExternalId,
      localProductId: obj.localProductId?.toString(),
      reviewer: obj.reviewer,
      reviewerEmail: obj.reviewerEmail,
      reviewerAvatarUrl: obj.reviewerAvatarUrl,
      review: obj.review,
      rating: obj.rating,
      verified: obj.verified,
      status: obj.status,
      source: obj.source,
      reviewType: obj.reviewType || ReviewType.PRODUCT,
      // Photos
      photos: (obj.photos || []).map((p: any) => ({
        _id: p._id?.toString(),
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        s3Key: p.s3Key,
        caption: p.caption,
        order: p.order,
        uploadedAt: p.uploadedAt,
      })),
      // Moderation
      moderationStatus: obj.moderationStatus || ModerationStatus.PENDING,
      moderatedBy: obj.moderatedBy?.toString(),
      moderatedAt: obj.moderatedAt,
      rejectionReason: obj.rejectionReason,
      // Publishing
      isPublished: obj.isPublished || false,
      publishedAt: obj.publishedAt,
      isFeatured: obj.isFeatured || false,
      featuredOrder: obj.featuredOrder,
      // Customer info
      customerEmail: obj.customerEmail,
      customerPhone: obj.customerPhone,
      customerId: obj.customerId?.toString(),
      // Engagement
      helpfulCount: obj.helpfulCount || 0,
      viewCount: obj.viewCount || 0,
      // Review request
      reviewRequestId: obj.reviewRequestId?.toString(),
      // Internal fields
      reply: obj.reply,
      repliedAt: obj.repliedAt,
      repliedBy: obj.repliedBy?.toString(),
      tags: obj.tags || [],
      internalNotes: obj.internalNotes,
      isFlagged: obj.isFlagged,
      flagReason: obj.flagReason,
      isDeleted: obj.isDeleted,
      wooCreatedAt: obj.wooCreatedAt,
      lastSyncedAt: obj.lastSyncedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      productName: product?.name,
      productImage: product?.images?.[0]?.src,
    };
  }

  // ==================== Photo Management ====================

  /**
   * Upload a photo for a review
   */
  async uploadPhoto(
    reviewId: string,
    userId: string,
    file: UploadedFile,
    caption?: string,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    // Upload to S3
    const folder = `reviews/${review.storeId.toString()}/${reviewId}`;
    const result = await this.s3UploadService.uploadImage(
      file,
      file.originalname,
      folder,
    );

    // Add photo to review
    const newPhoto = {
      url: result.url,
      s3Key: result.key,
      caption: caption || '',
      order: review.photos?.length || 0,
      uploadedAt: new Date(),
    };

    review.photos = [...(review.photos || []), newPhoto];
    await review.save();

    this.logger.log(`Photo uploaded for review ${reviewId}: ${result.url}`);

    return this.toInterface(review);
  }

  /**
   * Remove a photo from a review
   */
  async removePhoto(
    reviewId: string,
    photoId: string,
    userId: string,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    const photoIndex = review.photos?.findIndex(
      (p: any) => p._id?.toString() === photoId,
    );

    if (photoIndex === undefined || photoIndex === -1) {
      throw new ResourceNotFoundException('ReviewPhoto', photoId);
    }

    const photo = review.photos[photoIndex];

    // Delete from S3
    if (photo.s3Key) {
      try {
        await this.s3UploadService.deleteFile(photo.s3Key);
        this.logger.log(`Deleted photo from S3: ${photo.s3Key}`);
      } catch (error) {
        this.logger.error(`Failed to delete photo from S3: ${error.message}`);
      }
    }

    // Remove from array
    review.photos.splice(photoIndex, 1);

    // Reorder remaining photos
    review.photos.forEach((p: any, idx: number) => {
      p.order = idx;
    });

    await review.save();

    return this.toInterface(review);
  }

  /**
   * Reorder photos for a review
   */
  async reorderPhotos(
    reviewId: string,
    userId: string,
    photoIds: string[],
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    // Reorder photos based on photoIds array
    const reorderedPhotos = photoIds
      .map((id, index) => {
        const photo = review.photos?.find((p: any) => p._id?.toString() === id);
        if (photo) {
          photo.order = index;
          return photo;
        }
        return null;
      })
      .filter(Boolean);

    review.photos = reorderedPhotos;
    await review.save();

    return this.toInterface(review);
  }

  // ==================== Moderation ====================

  /**
   * Approve a review
   */
  async approve(reviewId: string, userId: string): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.moderationStatus = ModerationStatus.APPROVED;
    review.moderatedBy = new Types.ObjectId(userId) as any;
    review.moderatedAt = new Date();
    review.rejectionReason = undefined;

    await review.save();

    this.logger.log(`Review ${reviewId} approved by user ${userId}`);

    return this.toInterface(review);
  }

  /**
   * Reject a review
   */
  async reject(
    reviewId: string,
    userId: string,
    reason?: string,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.moderationStatus = ModerationStatus.REJECTED;
    review.moderatedBy = new Types.ObjectId(userId) as any;
    review.moderatedAt = new Date();
    review.rejectionReason = reason;
    review.isPublished = false;

    await review.save();

    this.logger.log(
      `Review ${reviewId} rejected by user ${userId}: ${reason || 'No reason'}`,
    );

    return this.toInterface(review);
  }

  /**
   * Flag a review for further review
   */
  async flag(
    reviewId: string,
    userId: string,
    reason: string,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.moderationStatus = ModerationStatus.FLAGGED;
    review.isFlagged = true;
    review.flagReason = reason;

    await review.save();

    this.logger.log(`Review ${reviewId} flagged by user ${userId}: ${reason}`);

    return this.toInterface(review);
  }

  /**
   * Bulk approve reviews
   */
  async bulkApprove(
    reviewIds: string[],
    userId: string,
  ): Promise<{ updated: number }> {
    const storeIds = await this.getUserStoreIds(userId);

    const result = await this.reviewModel.updateMany(
      {
        _id: { $in: reviewIds.map((id) => new Types.ObjectId(id)) },
        storeId: { $in: storeIds },
        isDeleted: false,
      },
      {
        $set: {
          moderationStatus: ModerationStatus.APPROVED,
          moderatedBy: new Types.ObjectId(userId),
          moderatedAt: new Date(),
        },
        $unset: { rejectionReason: 1 },
      },
    );

    this.logger.log(
      `Bulk approved ${result.modifiedCount} reviews by user ${userId}`,
    );

    return { updated: result.modifiedCount };
  }

  /**
   * Bulk reject reviews
   */
  async bulkReject(
    reviewIds: string[],
    userId: string,
    reason?: string,
  ): Promise<{ updated: number }> {
    const storeIds = await this.getUserStoreIds(userId);

    const result = await this.reviewModel.updateMany(
      {
        _id: { $in: reviewIds.map((id) => new Types.ObjectId(id)) },
        storeId: { $in: storeIds },
        isDeleted: false,
      },
      {
        $set: {
          moderationStatus: ModerationStatus.REJECTED,
          moderatedBy: new Types.ObjectId(userId),
          moderatedAt: new Date(),
          rejectionReason: reason,
          isPublished: false,
        },
      },
    );

    this.logger.log(
      `Bulk rejected ${result.modifiedCount} reviews by user ${userId}`,
    );

    return { updated: result.modifiedCount };
  }

  // ==================== Publishing ====================

  /**
   * Publish a review
   */
  async publish(reviewId: string, userId: string): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    if (review.moderationStatus !== ModerationStatus.APPROVED) {
      throw new ValidationException(
        'moderationStatus',
        'Review must be approved before publishing',
        {
          currentStatus: review.moderationStatus,
          requiredStatus: ModerationStatus.APPROVED,
        },
      );
    }

    review.isPublished = true;
    review.publishedAt = new Date();

    await review.save();

    this.logger.log(`Review ${reviewId} published by user ${userId}`);

    return this.toInterface(review);
  }

  /**
   * Unpublish a review
   */
  async unpublish(reviewId: string, userId: string): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.isPublished = false;

    await review.save();

    this.logger.log(`Review ${reviewId} unpublished by user ${userId}`);

    return this.toInterface(review);
  }

  /**
   * Bulk publish reviews
   */
  async bulkPublish(
    reviewIds: string[],
    userId: string,
  ): Promise<{ updated: number }> {
    const storeIds = await this.getUserStoreIds(userId);

    const result = await this.reviewModel.updateMany(
      {
        _id: { $in: reviewIds.map((id) => new Types.ObjectId(id)) },
        storeId: { $in: storeIds },
        moderationStatus: ModerationStatus.APPROVED,
        isDeleted: false,
      },
      {
        $set: {
          isPublished: true,
          publishedAt: new Date(),
        },
      },
    );

    this.logger.log(
      `Bulk published ${result.modifiedCount} reviews by user ${userId}`,
    );

    return { updated: result.modifiedCount };
  }

  /**
   * Feature a review
   */
  async feature(
    reviewId: string,
    userId: string,
    order?: number,
  ): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.isFeatured = true;
    review.featuredOrder = order;

    await review.save();

    this.logger.log(`Review ${reviewId} featured by user ${userId}`);

    return this.toInterface(review);
  }

  /**
   * Unfeature a review
   */
  async unfeature(reviewId: string, userId: string): Promise<IReview> {
    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      isDeleted: false,
    });

    if (!review) {
      throw new ResourceNotFoundException('Review', reviewId);
    }

    await this.verifyStoreAccess(review.storeId.toString(), userId);

    review.isFeatured = false;
    review.featuredOrder = undefined;

    await review.save();

    return this.toInterface(review);
  }

  // ==================== Manual Review Creation ====================

  /**
   * Create a manual review (from WhatsApp, social media, etc.)
   */
  async createManualReview(
    storeId: string,
    userId: string,
    dto: CreateReviewDto,
  ): Promise<IReview> {
    await this.verifyStoreAccess(storeId, userId);

    // Helper to check if a value is a valid MongoDB ObjectId
    const isValidObjectId = (value: any): boolean => {
      if (!value) return false;
      if (typeof value === 'number') return false;
      const str = value.toString().trim();
      if (str === '') return false;
      return /^[a-fA-F0-9]{24}$/.test(str);
    };

    // Find local product if productId provided and valid
    let localProduct: ProductDocument | null = null;
    if (dto.productId && isValidObjectId(dto.productId)) {
      localProduct = await this.productModel.findOne({
        _id: new Types.ObjectId(dto.productId),
        storeId: new Types.ObjectId(storeId),
        isDeleted: false,
      });
    }

    const reviewData: any = {
      storeId: new Types.ObjectId(storeId),
      reviewer: dto.reviewer,
      reviewerEmail:
        dto.reviewerEmail?.toLowerCase() ||
        `manual-${Date.now()}@no-email.local`,
      review: dto.review,
      rating: dto.rating,
      verified: dto.verified || false,
      status: ReviewStatus.APPROVED,
      source: dto.source || ReviewSource.MANUAL,
      reviewType: dto.reviewType || ReviewType.PRODUCT,
      moderationStatus: dto.autoApprove
        ? ModerationStatus.APPROVED
        : ModerationStatus.PENDING,
      isPublished: dto.autoApprove && dto.autoPublish ? true : false,
      publishedAt: dto.autoApprove && dto.autoPublish ? new Date() : undefined,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      customerId: isValidObjectId(dto.customerId)
        ? new Types.ObjectId(dto.customerId)
        : undefined,
      tags: dto.tags || [],
      internalNotes: dto.internalNotes,
      photos: [],
      isDeleted: false,
    };

    if (localProduct) {
      reviewData.localProductId = localProduct._id;
      reviewData.productExternalId = localProduct.externalId;
    }

    if (dto.autoApprove) {
      reviewData.moderatedBy = new Types.ObjectId(userId);
      reviewData.moderatedAt = new Date();
    }

    this.logger.log(
      `Creating manual review with data: ${JSON.stringify(
        reviewData,
        null,
        2,
      )}`,
    );

    let review;
    try {
      review = await this.reviewModel.create(reviewData);
    } catch (error) {
      this.logger.error(`Failed to create manual review: ${error.message}`);
      this.logger.error(`Review data was: ${JSON.stringify(reviewData)}`);
      throw error;
    }

    this.logger.log(
      `Manual review created for store ${storeId} by user ${userId}`,
    );

    // Sync product rating if applicable
    if (
      localProduct &&
      reviewData.moderationStatus === ModerationStatus.APPROVED
    ) {
      await this.syncProductRating(localProduct._id.toString()).catch((err) => {
        this.logger.error(`Failed to sync product rating: ${err.message}`);
      });
    }

    return this.toInterface(review, localProduct);
  }

  // ==================== Engagement ====================

  /**
   * Increment helpful count for a review
   */
  async incrementHelpful(reviewId: string): Promise<void> {
    await this.reviewModel.updateOne(
      { _id: new Types.ObjectId(reviewId) },
      { $inc: { helpfulCount: 1 } },
    );
  }

  /**
   * Increment view count for a review
   */
  async incrementViewCount(reviewId: string): Promise<void> {
    await this.reviewModel.updateOne(
      { _id: new Types.ObjectId(reviewId) },
      { $inc: { viewCount: 1 } },
    );
  }

  // ==================== CSV Import ====================

  /**
   * Import reviews from CSV content
   */
  async importFromCsv(
    userId: string,
    storeId: string,
    csvContent: string,
  ): Promise<{
    total: number;
    created: number;
    failed: number;
    errors: { row: number; error: string }[];
  }> {
    await this.verifyStoreAccess(storeId, userId);

    // Strip UTF-8 BOM if present
    const content = csvContent.replace(/^\uFEFF/, '');

    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    if (lines.length < 2) {
      throw new ValidationException(
        'csvContent',
        'file is empty or has no data rows',
        {
          lineCount: lines.length,
          expected: 'at least 2 lines (header + data)',
        },
      );
    }

    const headers = this.parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().trim(),
    );
    const dataRows = lines.slice(1);

    // Pre-load store products for matching
    const storeProducts = await this.productModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
    const productsByName = new Map(
      storeProducts.map((p) => [p.name?.toLowerCase(), p]),
    );
    const productsBySku = new Map(
      storeProducts.filter((p) => p.sku).map((p) => [p.sku?.toLowerCase(), p]),
    );

    const results = {
      total: dataRows.length,
      created: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
    };

    const getColumn = (row: string[], headerName: string): string => {
      const index = headers.indexOf(headerName.toLowerCase());
      return index >= 0 ? (row[index] || '').trim() : '';
    };

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2;
      try {
        const row = this.parseCsvLine(dataRows[i]);

        const reviewer = getColumn(row, 'reviewer');
        const review = getColumn(row, 'review');
        const ratingStr = getColumn(row, 'rating');

        if (!reviewer) {
          results.errors.push({
            row: rowNumber,
            error: 'Reviewer is required',
          });
          results.failed++;
          continue;
        }

        if (!review) {
          results.errors.push({
            row: rowNumber,
            error: 'Review is required',
          });
          results.failed++;
          continue;
        }

        const rating = parseInt(ratingStr, 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          results.errors.push({
            row: rowNumber,
            error: 'Rating must be between 1 and 5',
          });
          results.failed++;
          continue;
        }

        const email = getColumn(row, 'email');
        const productName = getColumn(row, 'product');
        const verified = ['yes', 'true', '1'].includes(
          getColumn(row, 'verified').toLowerCase(),
        );
        const tagsStr = getColumn(row, 'tags');
        const tags = tagsStr
          ? tagsStr.split(';').map((t) => t.trim()).filter(Boolean)
          : [];
        const dateStr = getColumn(row, 'date');
        const autoApprove = ['yes', 'true', '1'].includes(
          getColumn(row, 'auto approve').toLowerCase(),
        );
        const autoPublish = ['yes', 'true', '1'].includes(
          getColumn(row, 'auto publish').toLowerCase(),
        );

        // Match product by name or SKU
        let localProduct: ProductDocument | null = null;
        if (productName) {
          localProduct =
            productsByName.get(productName.toLowerCase()) ||
            productsBySku.get(productName.toLowerCase()) ||
            null;
        }

        const reviewData: any = {
          storeId: new Types.ObjectId(storeId),
          reviewer,
          reviewerEmail:
            email?.toLowerCase() ||
            `import-${Date.now()}-${i}@no-email.local`,
          review,
          rating,
          verified,
          status: ReviewStatus.APPROVED,
          source: ReviewSource.IMPORT,
          reviewType: ReviewType.PRODUCT,
          moderationStatus: autoApprove
            ? ModerationStatus.APPROVED
            : ModerationStatus.PENDING,
          isPublished: autoApprove && autoPublish ? true : false,
          publishedAt:
            autoApprove && autoPublish ? new Date() : undefined,
          tags,
          photos: [],
          isDeleted: false,
        };

        if (dateStr) {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            reviewData.wooCreatedAt = parsedDate;
          }
        }

        if (localProduct) {
          reviewData.localProductId = localProduct._id;
          reviewData.productExternalId = localProduct.externalId;
        }

        if (autoApprove) {
          reviewData.moderatedBy = new Types.ObjectId(userId);
          reviewData.moderatedAt = new Date();
        }

        await this.reviewModel.create(reviewData);
        results.created++;

        // Sync product rating if auto-approved and product matched
        if (
          localProduct &&
          reviewData.moderationStatus === ModerationStatus.APPROVED
        ) {
          await this.syncProductRating(localProduct._id.toString()).catch(
            (err) => {
              this.logger.error(
                `Failed to sync product rating after import: ${err.message}`,
              );
            },
          );
        }
      } catch (error) {
        this.logger.error(`Import error row ${rowNumber}: ${error.message}`);
        results.errors.push({ row: rowNumber, error: error.message });
        results.failed++;
      }
    }

    this.logger.log(
      `Review CSV import complete: ${results.created} created, ${results.failed} failed out of ${results.total}`,
    );

    return results;
  }

  /**
   * Parse a CSV line handling quoted fields
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  // ==================== Public API Methods ====================

  /**
   * Get published reviews for public API (no auth required)
   */
  async getPublishedReviews(
    storeId: string,
    options: {
      productId?: string;
      reviewType?: ReviewType;
      featured?: boolean;
      page?: number;
      size?: number;
      sortBy?: 'createdAt' | 'rating' | 'helpfulCount';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<IReviewResponse> {
    const filter: any = {
      storeId: new Types.ObjectId(storeId),
      isPublished: true,
      moderationStatus: ModerationStatus.APPROVED,
      isDeleted: false,
    };

    if (options.productId) {
      filter.localProductId = new Types.ObjectId(options.productId);
    }

    if (options.reviewType) {
      filter.reviewType = options.reviewType;
    }

    if (options.featured) {
      filter.isFeatured = true;
    }

    const page = options.page || 1;
    const size = options.size || 10;
    const skip = (page - 1) * size;

    const sortField = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    // Featured reviews should be sorted by featuredOrder first
    if (options.featured) {
      sort.featuredOrder = 1;
    }

    const [reviews, total] = await Promise.all([
      this.reviewModel.find(filter).sort(sort).skip(skip).limit(size),
      this.reviewModel.countDocuments(filter),
    ]);

    // Get product info
    const productIds = [
      ...new Set(
        reviews.map((r) => r.localProductId?.toString()).filter(Boolean),
      ),
    ];
    const products =
      productIds.length > 0
        ? await this.productModel.find({ _id: { $in: productIds } })
        : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    return {
      reviews: reviews.map((r) => {
        const product = r.localProductId
          ? productMap.get(r.localProductId.toString())
          : null;
        return this.toPublicInterface(r, product);
      }),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get review summary for public API
   */
  async getPublicSummary(storeId: string): Promise<{
    totalReviews: number;
    averageRating: number;
    ratingDistribution: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
    featuredCount: number;
    photoCount: number;
  }> {
    const filter = {
      storeId: new Types.ObjectId(storeId),
      isPublished: true,
      moderationStatus: ModerationStatus.APPROVED,
      isDeleted: false,
    };

    const [stats, featuredCount, photoStats] = await Promise.all([
      this.reviewModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
      ]),
      this.reviewModel.countDocuments({ ...filter, isFeatured: true }),
      this.reviewModel.aggregate([
        { $match: filter },
        { $project: { photoCount: { $size: { $ifNull: ['$photos', []] } } } },
        { $group: { _id: null, total: { $sum: '$photoCount' } } },
      ]),
    ]);

    const ratingDist = await this.reviewModel.aggregate([
      { $match: filter },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingDist.forEach((item: any) => {
      if (item._id >= 1 && item._id <= 5) {
        ratingDistribution[item._id as 1 | 2 | 3 | 4 | 5] = item.count;
      }
    });

    return {
      totalReviews: stats[0]?.totalReviews || 0,
      averageRating: Math.round((stats[0]?.avgRating || 0) * 10) / 10,
      ratingDistribution,
      featuredCount,
      photoCount: photoStats[0]?.total || 0,
    };
  }

  /**
   * Convert to public interface (hides internal fields)
   */
  private toPublicInterface(
    doc: ReviewDocument,
    product?: ProductDocument | null,
  ): IReview {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      localProductId: obj.localProductId?.toString(),
      reviewer: obj.reviewer,
      reviewerEmail: '', // Hidden for privacy
      reviewerAvatarUrl: obj.reviewerAvatarUrl,
      review: obj.review,
      rating: obj.rating,
      verified: obj.verified,
      status: obj.status,
      source: obj.source,
      reviewType: obj.reviewType || ReviewType.PRODUCT,
      photos: (obj.photos || []).map((p: any) => ({
        _id: p._id?.toString(),
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        caption: p.caption,
        order: p.order,
        uploadedAt: p.uploadedAt,
      })),
      moderationStatus: obj.moderationStatus,
      isPublished: obj.isPublished,
      publishedAt: obj.publishedAt,
      isFeatured: obj.isFeatured,
      featuredOrder: obj.featuredOrder,
      helpfulCount: obj.helpfulCount || 0,
      viewCount: obj.viewCount || 0,
      reply: obj.reply,
      repliedAt: obj.repliedAt,
      tags: [],
      isFlagged: false,
      isDeleted: false,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      productName: product?.name,
      productImage: product?.images?.[0]?.src,
    };
  }
}
