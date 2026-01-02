import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { SKUStatus } from './enum';

// BOM Material DTO
export class BOMMaterialDto {
  @ApiProperty({ description: 'Material ID' })
  materialId: string;

  @ApiProperty({ description: 'Quantity needed per unit' })
  quantity: number;

  @ApiProperty({ description: 'Unit of measurement' })
  unit: string;

  @ApiPropertyOptional({ description: 'Notes' })
  notes?: string;
}

const BOMMaterialSchema = Joi.object({
  materialId: Joi.string().required(),
  quantity: Joi.number().greater(0).required(),
  unit: Joi.string().required(),
  notes: Joi.string().optional().allow(''),
}).options({ stripUnknown: true });

// Create SKU DTO
export class CreateSKUDto {
  @ApiProperty({ description: 'Unique SKU code' })
  sku: string;

  @ApiProperty({ description: 'Product title' })
  title: string;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Product specifications (JSON)' })
  specs?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Product category' })
  category?: string;

  @ApiPropertyOptional({ enum: SKUStatus, description: 'SKU status' })
  status?: SKUStatus;

  @ApiPropertyOptional({ type: [BOMMaterialDto], description: 'Bill of Materials' })
  materials?: BOMMaterialDto[];

  @ApiPropertyOptional({ description: 'Labor cost per unit' })
  laborCost?: number;

  @ApiPropertyOptional({ description: 'Overhead cost per unit' })
  overheadCost?: number;

  @ApiPropertyOptional({ description: 'Use fixed cost instead of calculated' })
  fixedCost?: boolean;

  @ApiPropertyOptional({ description: 'Fixed cost value (when fixedCost=true)' })
  cost?: number;

  @ApiPropertyOptional({ description: 'Suggested selling price' })
  sellingPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum stock level for alerts' })
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Reorder point threshold' })
  reorderPoint?: number;

  @ApiPropertyOptional({ description: 'Quantity to reorder' })
  reorderQuantity?: number;

  @ApiPropertyOptional({ type: [String], description: 'Product images' })
  images?: string[];
}

export const CreateSKUSchema = Joi.object({
  sku: Joi.string().min(1).max(50).required(),
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().optional().allow(''),
  specs: Joi.object().optional(),
  category: Joi.string().optional().allow(''),
  status: Joi.string().valid(...Object.values(SKUStatus)).optional().default(SKUStatus.DRAFT),
  materials: Joi.array().items(BOMMaterialSchema).optional().default([]),
  laborCost: Joi.number().min(0).optional().default(0),
  overheadCost: Joi.number().min(0).optional().default(0),
  fixedCost: Joi.boolean().optional().default(false),
  cost: Joi.number().min(0).optional().default(0),
  sellingPrice: Joi.number().min(0).optional().default(0),
  minStockLevel: Joi.number().min(0).optional().default(0),
  reorderPoint: Joi.number().min(0).optional().default(0),
  reorderQuantity: Joi.number().min(0).optional().default(0),
  images: Joi.array().items(Joi.string()).optional().default([]),
});

// Update SKU DTO
export class UpdateSKUDto {
  @ApiPropertyOptional({ description: 'Product title' })
  title?: string;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Product specifications (JSON)' })
  specs?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Product category' })
  category?: string;

  @ApiPropertyOptional({ enum: SKUStatus, description: 'SKU status' })
  status?: SKUStatus;

  @ApiPropertyOptional({ type: [BOMMaterialDto], description: 'Bill of Materials' })
  materials?: BOMMaterialDto[];

  @ApiPropertyOptional({ description: 'Labor cost per unit' })
  laborCost?: number;

  @ApiPropertyOptional({ description: 'Overhead cost per unit' })
  overheadCost?: number;

  @ApiPropertyOptional({ description: 'Use fixed cost instead of calculated' })
  fixedCost?: boolean;

  @ApiPropertyOptional({ description: 'Fixed cost value (when fixedCost=true)' })
  cost?: number;

  @ApiPropertyOptional({ description: 'Suggested selling price' })
  sellingPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum stock level for alerts' })
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Reorder point threshold' })
  reorderPoint?: number;

  @ApiPropertyOptional({ description: 'Quantity to reorder' })
  reorderQuantity?: number;

  @ApiPropertyOptional({ type: [String], description: 'Product images' })
  images?: string[];
}

export const UpdateSKUSchema = Joi.object({
  title: Joi.string().min(1).max(255).optional(),
  description: Joi.string().optional().allow(''),
  specs: Joi.object().optional(),
  category: Joi.string().optional().allow(''),
  status: Joi.string().valid(...Object.values(SKUStatus)).optional(),
  materials: Joi.array().items(BOMMaterialSchema).optional(),
  laborCost: Joi.number().min(0).optional(),
  overheadCost: Joi.number().min(0).optional(),
  fixedCost: Joi.boolean().optional(),
  cost: Joi.number().min(0).optional(),
  sellingPrice: Joi.number().min(0).optional(),
  minStockLevel: Joi.number().min(0).optional(),
  reorderPoint: Joi.number().min(0).optional(),
  reorderQuantity: Joi.number().min(0).optional(),
  images: Joi.array().items(Joi.string()).optional(),
});

// Query SKU DTO
export class QuerySKUDto {
  @ApiPropertyOptional({ description: 'Store ID' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  status?: SKUStatus;

  @ApiPropertyOptional({ description: 'Search keyword' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  size?: number;

  @ApiPropertyOptional({ description: 'Sort field' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order (asc/desc)' })
  sortOrder?: 'asc' | 'desc';
}

export const QuerySKUSchema = Joi.object({
  storeId: Joi.string().optional(),
  category: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(SKUStatus)).optional(),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(20),
  sortBy: Joi.string().valid('title', 'sku', 'calculatedCost', 'sellingPrice', 'createdAt').optional().default('title'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('asc'),
});
