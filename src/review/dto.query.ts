import * as Joi from 'joi';
import {
  ReviewStatus,
  ReviewSource,
  ReviewType,
  ModerationStatus,
} from './enum';

export class QueryReviewDto {
  storeId?: string;
  productId?: string;
  status?: ReviewStatus;
  reviewType?: ReviewType;
  source?: ReviewSource;
  moderationStatus?: ModerationStatus;
  isPublished?: boolean;
  isFeatured?: boolean;
  minRating?: number;
  maxRating?: number;
  verified?: boolean;
  hasReply?: boolean;
  isFlagged?: boolean;
  reviewerEmail?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const QueryReviewSchema = Joi.object({
  storeId: Joi.string().optional(),
  productId: Joi.string().optional(),
  status: Joi.string()
    .valid(...Object.values(ReviewStatus))
    .optional(),
  reviewType: Joi.string()
    .valid(...Object.values(ReviewType))
    .optional(),
  source: Joi.string()
    .valid(...Object.values(ReviewSource))
    .optional(),
  moderationStatus: Joi.string()
    .valid(...Object.values(ModerationStatus))
    .optional(),
  isPublished: Joi.boolean().optional(),
  isFeatured: Joi.boolean().optional(),
  minRating: Joi.number().min(1).max(5).optional(),
  maxRating: Joi.number().min(1).max(5).optional(),
  verified: Joi.boolean().optional(),
  hasReply: Joi.boolean().optional(),
  isFlagged: Joi.boolean().optional(),
  reviewerEmail: Joi.string().email().optional(),
  search: Joi.string().optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('createdAt', 'rating', 'wooCreatedAt', 'helpfulCount', 'viewCount')
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
