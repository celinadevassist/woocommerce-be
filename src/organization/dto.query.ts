import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class QueryOrganizationDto {
  @ApiPropertyOptional({ description: 'Search keyword', example: 'my company' })
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

export const QueryOrganizationSchema = Joi.object().keys({
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).default(1).optional(),
  size: Joi.number().min(1).max(100).default(10).optional(),
  sortBy: Joi.string().valid('createdAt', 'name', 'updatedAt').default('createdAt').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});
