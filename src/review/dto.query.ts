import * as Joi from 'joi';
import { ReviewStatus } from './enum';

export class QueryReviewDto {
  storeId?: string;
  organizationId?: string;
  productId?: string;
  status?: ReviewStatus;
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
  organizationId: Joi.string().optional(),
  productId: Joi.string().optional(),
  status: Joi.string()
    .valid(...Object.values(ReviewStatus))
    .optional(),
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
    .valid('createdAt', 'rating', 'wooCreatedAt')
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
