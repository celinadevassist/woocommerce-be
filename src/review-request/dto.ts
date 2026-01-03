import * as Joi from 'joi';
import { ReviewRequestTrigger, ReviewRequestChannel, ReviewRequestStatus } from './enum';

// Query DTO for listing requests
export class QueryReviewRequestDto {
  storeId?: string;
  status?: ReviewRequestStatus;
  customerPhone?: string;
  orderNumber?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const QueryReviewRequestSchema = Joi.object({
  storeId: Joi.string().optional(),
  status: Joi.string()
    .valid(...Object.values(ReviewRequestStatus))
    .optional(),
  customerPhone: Joi.string().optional(),
  orderNumber: Joi.string().optional(),
  keyword: Joi.string().optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string().valid('createdAt', 'sentAt', 'status', 'customerName').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
});

// Update settings DTO
export class UpdateReviewRequestSettingsDto {
  enabled?: boolean;
  triggerOn?: ReviewRequestTrigger;
  delayHours?: number;
  linkExpirationDays?: number;
  channel?: ReviewRequestChannel;
  sendReminders?: boolean;
  reminderDelayDays?: number;
  maxReminders?: number;
  smsTemplate?: string;
  reminderTemplate?: string;
  excludeOrdersBelow?: number;
  onlyVerifiedCustomers?: boolean;
  autoApproveReviews?: boolean;
  autoApproveMinRating?: number;
  autoPublishApproved?: boolean;
}

export const UpdateReviewRequestSettingsSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  triggerOn: Joi.string()
    .valid(...Object.values(ReviewRequestTrigger))
    .optional(),
  delayHours: Joi.number().min(0).max(168).optional(), // Max 7 days
  linkExpirationDays: Joi.number().min(1).max(90).optional(), // Extended to 90 days
  channel: Joi.string()
    .valid(...Object.values(ReviewRequestChannel))
    .optional(),
  sendReminders: Joi.boolean().optional(),
  reminderDelayDays: Joi.number().min(1).max(14).optional(),
  maxReminders: Joi.number().min(0).max(5).optional(),
  smsTemplate: Joi.string().max(1000).optional(),
  reminderTemplate: Joi.string().max(1000).optional(),
  excludeOrdersBelow: Joi.number().min(0).optional().allow(null),
  onlyVerifiedCustomers: Joi.boolean().optional(),
  autoApproveReviews: Joi.boolean().optional(),
  autoApproveMinRating: Joi.number().min(1).max(5).optional(),
  autoPublishApproved: Joi.boolean().optional(),
});

// Manual trigger DTO
export class ManualTriggerDto {
  orderId: string;
}

export const ManualTriggerSchema = Joi.object({
  orderId: Joi.string().required(),
});

// Public submission DTO
export class SubmitReviewsDto {
  reviews: {
    productId?: string;
    rating: number;
    review: string;
  }[];
}

export const SubmitReviewsSchema = Joi.object({
  reviews: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().optional().allow(''),
        rating: Joi.number().required().min(1).max(5),
        review: Joi.string().required().max(5000),
      }),
    )
    .required()
    .min(1),
});

// Resend request DTO
export class ResendRequestDto {
  channel?: ReviewRequestChannel;
}

export const ResendRequestSchema = Joi.object({
  channel: Joi.string()
    .valid(...Object.values(ReviewRequestChannel))
    .optional(),
});
