import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { StorePlatform, StoreStatus } from './enum';

export class QueryStoreDto {
  @ApiPropertyOptional({ description: 'Organization ID to filter by' })
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Filter by platform', enum: StorePlatform })
  platform?: StorePlatform;

  @ApiPropertyOptional({ description: 'Filter by status', enum: StoreStatus })
  status?: StoreStatus;

  @ApiPropertyOptional({ description: 'Search keyword', example: 'my store' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', example: 10 })
  size?: number;

  @ApiPropertyOptional({ description: 'Sort field', example: 'createdAt' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', example: 'desc' })
  sortOrder?: 'asc' | 'desc';
}

export const QueryStoreSchema = Joi.object().keys({
  organizationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  platform: Joi.string().valid(...Object.values(StorePlatform)).optional(),
  status: Joi.string().valid(...Object.values(StoreStatus)).optional(),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).default(1).optional(),
  size: Joi.number().min(1).max(100).default(10).optional(),
  sortBy: Joi.string().valid('createdAt', 'name', 'updatedAt', 'status').default('createdAt').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});
