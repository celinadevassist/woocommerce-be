import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { OrderStatus, PaymentStatus, FulfillmentStatus } from './enum';

export class QueryOrderDto {
  @ApiPropertyOptional({ description: 'Store ID to filter by' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Organization ID to filter by' })
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Filter by order status', enum: OrderStatus })
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Filter by payment status', enum: PaymentStatus })
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by fulfillment status', enum: FulfillmentStatus })
  fulfillmentStatus?: FulfillmentStatus;

  @ApiPropertyOptional({ description: 'Customer ID' })
  customerId?: string;

  @ApiPropertyOptional({ description: 'Search by order number, email, or phone' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Start date filter' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Minimum order total' })
  minTotal?: number;

  @ApiPropertyOptional({ description: 'Maximum order total' })
  maxTotal?: number;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', example: 20 })
  size?: number;

  @ApiPropertyOptional({ description: 'Sort field', example: 'dateCreatedWoo' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', example: 'desc' })
  sortOrder?: 'asc' | 'desc';
}

export const QueryOrderSchema = Joi.object().keys({
  storeId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  organizationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  status: Joi.string().valid(...Object.values(OrderStatus)).optional(),
  paymentStatus: Joi.string().valid(...Object.values(PaymentStatus)).optional(),
  fulfillmentStatus: Joi.string().valid(...Object.values(FulfillmentStatus)).optional(),
  customerId: Joi.string().optional(),
  keyword: Joi.string().optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  minTotal: Joi.number().min(0).optional(),
  maxTotal: Joi.number().min(0).optional(),
  page: Joi.number().min(1).default(1).optional(),
  size: Joi.number().min(1).max(100).default(20).optional(),
  sortBy: Joi.string().valid('dateCreatedWoo', 'total', 'orderNumber', 'status', 'createdAt').default('dateCreatedWoo').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});
