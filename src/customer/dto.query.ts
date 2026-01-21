import * as Joi from 'joi';
import { CustomerStatus, CustomerSource, CustomerTier } from './enum';

export class QueryCustomerDto {
  storeId?: string;
  status?: CustomerStatus;
  source?: CustomerSource;
  tier?: CustomerTier;
  search?: string;
  email?: string;
  phone?: string;
  isPayingCustomer?: boolean;
  minOrders?: number;
  maxOrders?: number;
  minSpent?: number;
  maxSpent?: number;
  tags?: string[];
  startDate?: string;
  endDate?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const QueryCustomerSchema = Joi.object({
  storeId: Joi.string().optional(),
  status: Joi.string()
    .valid(...Object.values(CustomerStatus))
    .optional(),
  source: Joi.string()
    .valid(...Object.values(CustomerSource))
    .optional(),
  tier: Joi.string()
    .valid(...Object.values(CustomerTier))
    .optional(),
  search: Joi.string().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  isPayingCustomer: Joi.boolean().optional(),
  minOrders: Joi.number().min(0).optional(),
  maxOrders: Joi.number().min(0).optional(),
  minSpent: Joi.number().min(0).optional(),
  maxSpent: Joi.number().min(0).optional(),
  tags: Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid(
      'createdAt',
      'email',
      'firstName',
      'lastName',
      'stats.ordersCount',
      'stats.totalSpent',
    )
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
