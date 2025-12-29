import * as Joi from 'joi';

// Query DTOs for Admin endpoints

export class AdminQueryUsersDTO {
  page?: number;
  size?: number;
  keyword?: string;
  role?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const AdminQueryUsersSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  keyword: Joi.string().optional().allow(''),
  role: Joi.string().valid('admin', 'user', '').optional().allow(''),
  sortBy: Joi.string().valid('createdAt', 'email', 'firstName', 'lastName').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export class AdminQueryStoresDTO {
  page?: number;
  size?: number;
  keyword?: string;
  platform?: string;
  status?: string;
  subscriptionStatus?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const AdminQueryStoresSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  keyword: Joi.string().optional().allow(''),
  platform: Joi.string().optional().allow(''),
  status: Joi.string().valid('active', 'inactive', 'suspended', 'error', '').optional().allow(''),
  subscriptionStatus: Joi.string().valid('active', 'suspended', 'cancelled', 'trial', '').optional().allow(''),
  sortBy: Joi.string().valid('createdAt', 'name', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export class AdminQuerySubscriptionsDTO {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const AdminQuerySubscriptionsSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  keyword: Joi.string().optional().allow(''),
  status: Joi.string().valid('active', 'suspended', 'cancelled', 'trial', '').optional().allow(''),
  sortBy: Joi.string().valid('createdAt', 'nextInvoiceDate', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export class AdminQueryInvoicesDTO {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  storeId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const AdminQueryInvoicesSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  size: Joi.number().min(1).max(100).default(20),
  keyword: Joi.string().optional().allow(''),
  status: Joi.string().valid('pending', 'paid', 'overdue', 'cancelled', '').optional().allow(''),
  storeId: Joi.string().optional().allow(''),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  sortBy: Joi.string().valid('createdAt', 'dueDate', 'amount', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
