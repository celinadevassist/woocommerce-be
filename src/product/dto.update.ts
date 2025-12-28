import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { ProductStatus, StockStatus } from './enum';

// Image DTO for product image management
export class ProductImageDto {
  @ApiPropertyOptional({ description: 'Image source URL' })
  src: string;

  @ApiPropertyOptional({ description: 'Image alt text' })
  alt?: string;

  @ApiPropertyOptional({ description: 'Image name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Image position/order' })
  position?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Short description' })
  shortDescription?: string;

  @ApiPropertyOptional({ description: 'Regular price' })
  regularPrice?: string;

  @ApiPropertyOptional({ description: 'Sale price' })
  salePrice?: string;

  @ApiPropertyOptional({ description: 'Product SKU' })
  sku?: string;

  @ApiPropertyOptional({ description: 'Product status', enum: ProductStatus })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Manage stock', example: true })
  manageStock?: boolean;

  @ApiPropertyOptional({ description: 'Stock quantity', example: 100 })
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Stock status', enum: StockStatus })
  stockStatus?: StockStatus;

  @ApiPropertyOptional({ description: 'Low stock threshold' })
  lowStockAmount?: number;

  @ApiPropertyOptional({ description: 'Product images', type: [ProductImageDto] })
  images?: ProductImageDto[];
}

const ProductImageJoiSchema = Joi.object().keys({
  src: Joi.string().uri().required(),
  alt: Joi.string().allow('').optional(),
  name: Joi.string().allow('').optional(),
  position: Joi.number().min(0).optional(),
});

export const UpdateProductSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().optional(),
  shortDescription: Joi.string().optional(),
  regularPrice: Joi.string().optional(),
  salePrice: Joi.string().allow('').optional(),
  sku: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(ProductStatus)).optional(),
  manageStock: Joi.boolean().optional(),
  stockQuantity: Joi.number().min(0).optional(),
  stockStatus: Joi.string().valid(...Object.values(StockStatus)).optional(),
  lowStockAmount: Joi.number().min(0).optional(),
  images: Joi.array().items(ProductImageJoiSchema).optional(),
});

export class UpdateStockDto {
  @ApiPropertyOptional({ description: 'New stock quantity', example: 50 })
  quantity: number;
}

export const UpdateStockSchema = Joi.object().keys({
  quantity: Joi.number().min(0).required(),
});

// Bulk update DTO
export class BulkUpdateProductDto {
  productIds: string[];
  status?: ProductStatus;
  stockQuantity?: number;
  stockStatus?: StockStatus;
  regularPrice?: string;
  salePrice?: string;
  manageStock?: boolean;
  lowStockAmount?: number;
  priceAdjustment?: {
    type: 'increase' | 'decrease';
    method: 'percentage' | 'fixed';
    value: number;
  };
}

export const BulkUpdateProductSchema = Joi.object().keys({
  productIds: Joi.array().items(Joi.string()).min(1).required(),
  status: Joi.string().valid(...Object.values(ProductStatus)).optional(),
  stockQuantity: Joi.number().min(0).optional(),
  stockStatus: Joi.string().valid(...Object.values(StockStatus)).optional(),
  regularPrice: Joi.string().optional(),
  salePrice: Joi.string().allow('').optional(),
  manageStock: Joi.boolean().optional(),
  lowStockAmount: Joi.number().min(0).optional(),
  priceAdjustment: Joi.object({
    type: Joi.string().valid('increase', 'decrease').required(),
    method: Joi.string().valid('percentage', 'fixed').required(),
    value: Joi.number().min(0).required(),
  }).optional(),
});

// Bulk update variant DTO
export class BulkUpdateVariantDto {
  variantIds: string[];
  stockQuantity?: number;
  stockStatus?: StockStatus;
  regularPrice?: string;
  salePrice?: string;
  manageStock?: boolean;
  status?: string;
  priceAdjustment?: {
    type: 'increase' | 'decrease';
    method: 'percentage' | 'fixed';
    value: number;
  };
}

export const BulkUpdateVariantSchema = Joi.object().keys({
  variantIds: Joi.array().items(Joi.string()).min(1).required(),
  stockQuantity: Joi.number().min(0).optional(),
  stockStatus: Joi.string().valid(...Object.values(StockStatus)).optional(),
  regularPrice: Joi.string().optional(),
  salePrice: Joi.string().allow('').optional(),
  manageStock: Joi.boolean().optional(),
  status: Joi.string().valid('publish', 'pending', 'draft', 'private').optional(),
  priceAdjustment: Joi.object({
    type: Joi.string().valid('increase', 'decrease').required(),
    method: Joi.string().valid('percentage', 'fixed').required(),
    value: Joi.number().min(0).required(),
  }).optional(),
});
