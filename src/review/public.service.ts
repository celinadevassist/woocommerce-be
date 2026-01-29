import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schema';
import { Product, ProductDocument } from '../product/schema';
import { ModerationStatus, ReviewStatus, ReviewType } from './enum';

interface PublicReviewsOptions {
  productId?: string;
  reviewType?: ReviewType;
  featured?: boolean;
  page?: number;
  size?: number;
  sortBy?: 'createdAt' | 'wooCreatedAt' | 'rating' | 'helpfulCount';
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class PublicReviewService {
  private readonly logger = new Logger(PublicReviewService.name);

  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  /**
   * Get published reviews for public display
   */
  async getPublishedReviews(
    storeId: string,
    options: PublicReviewsOptions = {},
  ) {
    const {
      productId,
      reviewType,
      featured,
      page = 1,
      size = 10,
      sortBy = 'wooCreatedAt',
      sortOrder = 'desc',
    } = options;

    const storeObjectId = new Types.ObjectId(storeId);
    const query: any = {
      storeId: storeObjectId,
      isPublished: true,
      moderationStatus: ModerationStatus.APPROVED,
      status: ReviewStatus.APPROVED,
      isDeleted: false,
    };

    if (productId) {
      query.localProductId = productId;
    }

    if (reviewType) {
      query.reviewType = reviewType;
    }

    if (featured) {
      query.isFeatured = true;
    }

    // Sort by wooCreatedAt with fallback to createdAt for manual reviews
    const sort: any = {};
    if (sortBy === 'wooCreatedAt') {
      // Use wooCreatedAt primarily, then createdAt as secondary sort for reviews without wooCreatedAt
      sort.wooCreatedAt = sortOrder === 'asc' ? 1 : -1;
      sort.createdAt = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const skip = (page - 1) * size;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(size)
        .select(
          '-internalNotes -moderatedBy -moderatedAt -rejectionReason -isDeleted',
        )
        .lean(),
      this.reviewModel.countDocuments(query),
    ]);

    // Get product info for reviews
    const productIds = [
      ...new Set(
        reviews.map((r) => r.localProductId?.toString()).filter(Boolean),
      ),
    ];
    const products =
      productIds.length > 0
        ? await this.productModel
            .find({ _id: { $in: productIds } })
            .select('name images')
            .lean()
        : [];

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const enrichedReviews = reviews.map((review) => {
      const product = review.localProductId
        ? productMap.get(review.localProductId.toString())
        : null;
      return {
        _id: review._id,
        reviewer: review.reviewer,
        reviewerAvatarUrl: review.reviewerAvatarUrl,
        review: review.review,
        rating: review.rating,
        verified: review.verified,
        reviewType: review.reviewType,
        photos: review.photos,
        reply: review.reply,
        repliedAt: review.repliedAt,
        helpfulCount: review.helpfulCount,
        isFeatured: review.isFeatured,
        createdAt: review.createdAt,
        wooCreatedAt: review.wooCreatedAt,
        product: product
          ? {
              _id: product._id,
              name: product.name,
              image: product.images?.[0]?.src,
            }
          : null,
      };
    });

    return {
      reviews: enrichedReviews,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get public summary statistics
   */
  async getPublicSummary(storeId: string) {
    const storeObjectId = new Types.ObjectId(storeId);
    const query = {
      storeId: storeObjectId,
      isPublished: true,
      moderationStatus: ModerationStatus.APPROVED,
      status: ReviewStatus.APPROVED,
      isDeleted: false,
    };

    const [total, ratingStats] = await Promise.all([
      this.reviewModel.countDocuments(query),
      this.reviewModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            count1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            count2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            count3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            count4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            count5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = ratingStats[0] || {
      averageRating: 0,
      count1: 0,
      count2: 0,
      count3: 0,
      count4: 0,
      count5: 0,
    };

    return {
      totalReviews: total,
      averageRating: Math.round((stats.averageRating || 0) * 10) / 10,
      ratingDistribution: {
        1: stats.count1,
        2: stats.count2,
        3: stats.count3,
        4: stats.count4,
        5: stats.count5,
      },
    };
  }

  /**
   * Increment helpful count
   */
  async incrementHelpful(reviewId: string): Promise<void> {
    await this.reviewModel.updateOne(
      { _id: reviewId },
      { $inc: { helpfulCount: 1 } },
    );
  }

  /**
   * Increment view count
   */
  async incrementViewCount(reviewId: string): Promise<void> {
    await this.reviewModel.updateOne(
      { _id: reviewId },
      { $inc: { viewCount: 1 } },
    );
  }
}
