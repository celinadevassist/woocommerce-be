import * as Joi from 'joi';
import { StockTransactionType, StockStatus } from './enum';

// Create Product Stock DTO
export class CreateProductStockDto {
  productId?: string;
  variantId?: string;
  skuId?: string;
  sku: string;
  productName: string;
  variantName?: string;
  currentStock?: number;
  minStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  unitCost?: number;
  location?: string;
}

export const CreateProductStockSchema = Joi.object({
  productId: Joi.string().optional(),
  variantId: Joi.string().optional(),
  skuId: Joi.string().optional(),
  sku: Joi.string().required(),
  productName: Joi.string().required(),
  variantName: Joi.string().optional().allow(''),
  currentStock: Joi.number().min(0).optional().default(0),
  minStockLevel: Joi.number().min(0).optional().default(0),
  reorderPoint: Joi.number().min(0).optional().default(0),
  reorderQuantity: Joi.number().min(0).optional().default(0),
  unitCost: Joi.number().min(0).optional().default(0),
  location: Joi.string().optional().allow(''),
});

// Update Product Stock DTO
export class UpdateProductStockDto {
  productName?: string;
  variantName?: string;
  minStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  unitCost?: number;
  location?: string;
}

export const UpdateProductStockSchema = Joi.object({
  productName: Joi.string().optional(),
  variantName: Joi.string().optional().allow(''),
  minStockLevel: Joi.number().min(0).optional(),
  reorderPoint: Joi.number().min(0).optional(),
  reorderQuantity: Joi.number().min(0).optional(),
  unitCost: Joi.number().min(0).optional(),
  location: Joi.string().optional().allow(''),
});

// Add Stock DTO (from production, purchase, return)
export class AddStockDto {
  quantity: number;
  unitCost?: number;
  reference?: string;
  referenceType?: string;
  notes?: string;
}

export const AddStockSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
  unitCost: Joi.number().min(0).optional(),
  reference: Joi.string().optional().allow(''),
  referenceType: Joi.string().optional().allow(''),
  notes: Joi.string().optional().allow(''),
});

// Deduct Stock DTO (for sales, damage)
export class DeductStockDto {
  quantity: number;
  type: StockTransactionType;
  reference?: string;
  referenceType?: string;
  notes?: string;
}

export const DeductStockSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
  type: Joi.string().valid(
    StockTransactionType.SALE,
    StockTransactionType.DAMAGE,
    StockTransactionType.TRANSFER_OUT,
    StockTransactionType.ADJUSTMENT,
  ).required(),
  reference: Joi.string().optional().allow(''),
  referenceType: Joi.string().optional().allow(''),
  notes: Joi.string().optional().allow(''),
});

// Adjust Stock DTO (set to specific value)
export class AdjustStockDto {
  newStock: number;
  notes?: string;
}

export const AdjustStockSchema = Joi.object({
  newStock: Joi.number().integer().min(0).required(),
  notes: Joi.string().optional().allow(''),
});

// Reserve Stock DTO
export class ReserveStockDto {
  quantity: number;
  orderId?: string;
}

export const ReserveStockSchema = Joi.object({
  quantity: Joi.number().integer().positive().required(),
  orderId: Joi.string().optional(),
});

// Query Product Stock DTO
export class QueryProductStockDto {
  storeId?: string;
  status?: StockStatus;
  lowStock?: boolean;
  keyword?: string;
  location?: string;
  page?: number;
  size?: number;
}

export const QueryProductStockSchema = Joi.object({
  storeId: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(StockStatus)).optional(),
  lowStock: Joi.boolean().optional(),
  keyword: Joi.string().optional(),
  location: Joi.string().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(20),
});

// Query Transactions DTO
export class QueryTransactionsDto {
  type?: StockTransactionType;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  size?: number;
}

export const QueryTransactionsSchema = Joi.object({
  type: Joi.string().valid(...Object.values(StockTransactionType)).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(50),
});
