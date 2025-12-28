import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name' })
  name: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  parentId?: string;

  @ApiPropertyOptional({ description: 'Category description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Display type' })
  display?: string;

  @ApiPropertyOptional({ description: 'Menu order' })
  menuOrder?: number;

  @ApiPropertyOptional({ description: 'Image URL' })
  imageUrl?: string;
}

export const CreateCategorySchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).required(),
  slug: Joi.string().optional(),
  parentId: Joi.string().optional().allow(null, ''),
  description: Joi.string().optional().allow(''),
  display: Joi.string().valid('default', 'products', 'subcategories', 'both').optional(),
  menuOrder: Joi.number().min(0).optional(),
  imageUrl: Joi.string().uri().optional().allow(''),
});

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Category name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'Category description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Display type' })
  display?: string;

  @ApiPropertyOptional({ description: 'Menu order' })
  menuOrder?: number;

  @ApiPropertyOptional({ description: 'Image URL' })
  imageUrl?: string;
}

export const UpdateCategorySchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  slug: Joi.string().optional(),
  parentId: Joi.string().optional().allow(null, ''),
  description: Joi.string().optional().allow(''),
  display: Joi.string().valid('default', 'products', 'subcategories', 'both').optional(),
  menuOrder: Joi.number().min(0).optional(),
  imageUrl: Joi.string().uri().optional().allow(''),
});

export class QueryCategoryDto {
  @ApiPropertyOptional({ description: 'Store ID' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Parent category ID (null for root)' })
  parentId?: string;

  @ApiPropertyOptional({ description: 'Search keyword' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  size?: number;

  @ApiPropertyOptional({ description: 'Return as tree structure' })
  tree?: boolean;
}

export const QueryCategorySchema = Joi.object().keys({
  storeId: Joi.string().optional(),
  parentId: Joi.string().optional().allow(null, ''),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).optional(),
  size: Joi.number().min(1).max(100).optional(),
  tree: Joi.boolean().optional(),
});
