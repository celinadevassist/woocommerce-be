import * as Joi from 'joi';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerStatus, CustomerTier } from './enum';

export class UpdateCustomerDto {
  status?: CustomerStatus;
  tier?: CustomerTier;
  tags?: string[];
}

export const UpdateCustomerSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(CustomerStatus))
    .optional(),
  tier: Joi.string()
    .valid(...Object.values(CustomerTier))
    .optional(),
  tags: Joi.array().items(Joi.string()).optional(),
});

export class AddCustomerNoteDto {
  @ApiPropertyOptional({ description: 'Note content', required: true })
  content: string;
}

export const AddCustomerNoteSchema = Joi.object().keys({
  content: Joi.string().required().min(1).max(5000),
});

export class UpdateCustomerStatsDto {
  ordersCount?: number;
  totalSpent?: number;
  averageOrderValue?: number;
  lastOrderDate?: Date;
  firstOrderDate?: Date;
}

export const UpdateCustomerStatsSchema = Joi.object({
  ordersCount: Joi.number().min(0).optional(),
  totalSpent: Joi.number().min(0).optional(),
  averageOrderValue: Joi.number().min(0).optional(),
  lastOrderDate: Joi.date().optional(),
  firstOrderDate: Joi.date().optional(),
});
