import { ReviewStatus, ReviewSource } from './enum';

export interface IReview {
  _id: string;
  externalId: number;
  storeId: string;
  organizationId: string;
  productExternalId: number;
  localProductId?: string;
  reviewer: string;
  reviewerEmail: string;
  reviewerAvatarUrl?: string;
  review: string;
  rating: number;
  verified: boolean;
  status: ReviewStatus;
  source: ReviewSource;
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
