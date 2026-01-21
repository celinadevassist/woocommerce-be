import * as Joi from 'joi';
import { ReviewSource, ReviewType } from './enum';

export class CreateReviewDto {
  reviewer: string;
  reviewerEmail?: string;
  review: string;
  rating: number;
  verified?: boolean;
  productId?: string;
  source?: ReviewSource;
  reviewType?: ReviewType;
  customerEmail?: string;
  customerPhone?: string;
  customerId?: string;
  tags?: string[];
  internalNotes?: string;
  autoApprove?: boolean;
  autoPublish?: boolean;
}

export const CreateReviewSchema = Joi.object({
  reviewer: Joi.string().required().max(200).messages({
    'string.empty': 'Reviewer name is required',
    'any.required': 'Reviewer name is required',
  }),
  reviewerEmail: Joi.string().email().optional().allow(''),
  review: Joi.string().required().max(5000).messages({
    'string.empty': 'Review content is required',
    'any.required': 'Review content is required',
  }),
  rating: Joi.number().required().min(1).max(5).messages({
    'number.min': 'Rating must be between 1 and 5',
    'number.max': 'Rating must be between 1 and 5',
    'any.required': 'Rating is required',
  }),
  verified: Joi.boolean().optional().default(false),
  productId: Joi.string().optional().allow(''),
  source: Joi.string()
    .valid(...Object.values(ReviewSource))
    .optional()
    .default(ReviewSource.MANUAL),
  reviewType: Joi.string()
    .valid(...Object.values(ReviewType))
    .optional()
    .default(ReviewType.PRODUCT),
  customerEmail: Joi.string().email().optional().allow(''),
  customerPhone: Joi.string().optional().allow('').max(20),
  customerId: Joi.string().optional().allow(''),
  tags: Joi.array().items(Joi.string().max(50)).optional().default([]),
  internalNotes: Joi.string().optional().allow('').max(2000),
  autoApprove: Joi.boolean().optional().default(false),
  autoPublish: Joi.boolean().optional().default(false),
});

// DTO for rejecting a review
export class RejectReviewDto {
  reason?: string;
}

export const RejectReviewSchema = Joi.object({
  reason: Joi.string().optional().allow('').max(500),
});

// DTO for featuring a review
export class FeatureReviewDto {
  order?: number;
}

export const FeatureReviewSchema = Joi.object({
  order: Joi.number().optional().min(0),
});

// DTO for bulk operations
export class BulkReviewIdsDto {
  reviewIds: string[];
  reason?: string;
}

export const BulkReviewIdsSchema = Joi.object({
  reviewIds: Joi.array()
    .items(Joi.string().required())
    .required()
    .min(1)
    .max(100)
    .messages({
      'array.min': 'At least one review ID is required',
      'array.max': 'Maximum 100 reviews can be processed at once',
    }),
  reason: Joi.string().optional().allow('').max(500),
});

// DTO for reordering photos
export class ReorderPhotosDto {
  photoIds: string[];
}

export const ReorderPhotosSchema = Joi.object({
  photoIds: Joi.array()
    .items(Joi.string().required())
    .required()
    .min(1)
    .messages({
      'array.min': 'At least one photo ID is required',
    }),
});

// DTO for uploading photo with caption
export class UploadPhotoDto {
  caption?: string;
}

export const UploadPhotoSchema = Joi.object({
  caption: Joi.string().optional().allow('').max(500),
});
