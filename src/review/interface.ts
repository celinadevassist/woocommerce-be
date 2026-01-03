import { ReviewStatus, ReviewSource, ReviewType, ModerationStatus } from './enum';

export interface IReviewPhoto {
  _id?: string;
  url: string;
  thumbnailUrl?: string;
  s3Key?: string;
  caption?: string;
  order: number;
  uploadedAt: Date;
}

export interface IReview {
  _id: string;
  externalId?: number;
  storeId: string;
  productExternalId?: number;
  localProductId?: string;
  reviewer: string;
  reviewerEmail: string;
  reviewerAvatarUrl?: string;
  review: string;
  rating: number;
  verified: boolean;
  status: ReviewStatus;
  source: ReviewSource;
  reviewType: ReviewType;
  // Photos
  photos: IReviewPhoto[];
  // Moderation
  moderationStatus: ModerationStatus;
  moderatedBy?: string;
  moderatedAt?: Date;
  rejectionReason?: string;
  // Publishing
  isPublished: boolean;
  publishedAt?: Date;
  isFeatured: boolean;
  featuredOrder?: number;
  // Customer info (for manual reviews)
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  // Engagement
  helpfulCount: number;
  viewCount: number;
  // Review request reference
  reviewRequestId?: string;
  // Internal fields
  reply?: string;
  repliedAt?: Date;
  repliedBy?: string;
  tags: string[];
  internalNotes?: string;
  isFlagged: boolean;
  flagReason?: string;
  isDeleted: boolean;
  wooCreatedAt?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Populated fields
  productName?: string;
  productImage?: string;
}

export interface IReviewResponse {
  reviews: IReview[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface IReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  pendingReviews: number;
  verifiedReviews: number;
  repliedReviews: number;
  recentReviews: IReview[];
}
