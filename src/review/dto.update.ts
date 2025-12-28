import * as Joi from 'joi';
import { ReviewStatus } from './enum';

export class UpdateReviewDto {
  status?: ReviewStatus;
  syncToStore?: boolean;
  tags?: string[];
  internalNotes?: string;
  isFlagged?: boolean;
  flagReason?: string;
}

export const UpdateReviewSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(ReviewStatus))
    .optional(),
  syncToStore: Joi.boolean().default(true).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  internalNotes: Joi.string().allow('').optional(),
  isFlagged: Joi.boolean().optional(),
  flagReason: Joi.string().allow('').optional(),
});

export class ReplyReviewDto {
  reply: string;
}

export const ReplyReviewSchema = Joi.object({
  reply: Joi.string().required().min(1).max(5000),
});
