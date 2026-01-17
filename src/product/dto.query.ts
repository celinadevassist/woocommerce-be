import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { ProductStatus, StockStatus, ProductType } from './enum';

export class QueryProductDto {
  @ApiPropertyOptional({ description: 'Store ID to filter by' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filter by product status', enum: ProductStatus })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Filter by stock status', enum: StockStatus })
  stockStatus?: StockStatus;

  @ApiPropertyOptional({ description: 'Filter by product type', enum: ProductType })
  type?: ProductType;

  @ApiPropertyOptional({ description: 'Filter by category ID or slug' })
  categoryId?: number | string;

  @ApiPropertyOptional({ description: 'Search keyword', example: 'shirt' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Filter low stock products', example: true })
  lowStock?: boolean;

  @ApiPropertyOptional({ description: 'Filter products pending sync', example: true })
  pendingSync?: boolean;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', example: 20 })
  size?: number;

  @ApiPropertyOptional({ description: 'Sort field', example: 'createdAt' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', example: 'desc' })
  sortOrder?: 'asc' | 'desc';
}

export const QueryProductSchema = Joi.object().keys({
  storeId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  status: Joi.string().valid(...Object.values(ProductStatus)).optional(),
  stockStatus: Joi.string().valid(...Object.values(StockStatus)).optional(),
  type: Joi.string().valid(...Object.values(ProductType)).optional(),
  categoryId: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  keyword: Joi.string().optional(),
  lowStock: Joi.boolean().optional(),
  pendingSync: Joi.boolean().optional(),
  page: Joi.number().min(1).default(1).optional(),
  size: Joi.number().min(1).max(100).default(20).optional(),
  sortBy: Joi.string().valid('createdAt', 'name', 'updatedAt', 'price', 'stockQuantity', 'totalSales').default('createdAt').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});
