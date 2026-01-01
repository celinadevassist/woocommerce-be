import * as Joi from 'joi';
import { OrderItemSource } from './enum';

// ========================
// Create Order Item
// ========================

export class CreateOrderItemDto {
  productId?: string;
  variantId?: string;
  skuId?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
  attributes?: Record<string, any>;
  notes?: string;
  source?: OrderItemSource;
}

export const CreateOrderItemSchema = Joi.object({
  productId: Joi.string().hex().length(24),
  variantId: Joi.string().hex().length(24),
  skuId: Joi.string().hex().length(24),
  sku: Joi.string().max(100),
  name: Joi.string().required().min(1).max(500),
  quantity: Joi.number().required().integer().min(1),
  unitPrice: Joi.number().required().min(0),
  discountAmount: Joi.number().min(0).default(0),
  taxAmount: Joi.number().min(0).default(0),
  attributes: Joi.object().unknown(true),
  notes: Joi.string().max(1000),
  source: Joi.string().valid(...Object.values(OrderItemSource)),
});

// ========================
// Bulk Create Order Items
// ========================

export class BulkCreateOrderItemsDto {
  items: CreateOrderItemDto[];
  source?: OrderItemSource;
}

export const BulkCreateOrderItemsSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().hex().length(24),
        variantId: Joi.string().hex().length(24),
        skuId: Joi.string().hex().length(24),
        sku: Joi.string().max(100),
        name: Joi.string().required().min(1).max(500),
        quantity: Joi.number().required().integer().min(1),
        unitPrice: Joi.number().required().min(0),
        discountAmount: Joi.number().min(0).default(0),
        taxAmount: Joi.number().min(0).default(0),
        attributes: Joi.object().unknown(true),
        notes: Joi.string().max(1000),
      }),
    )
    .min(1)
    .max(100)
    .required(),
  source: Joi.string().valid(...Object.values(OrderItemSource)),
});

// ========================
// Update Order Item
// ========================

export class UpdateOrderItemDto {
  name?: string;
  quantity?: number;
  unitPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  attributes?: Record<string, any>;
  notes?: string;
}

export const UpdateOrderItemSchema = Joi.object({
  name: Joi.string().min(1).max(500),
  quantity: Joi.number().integer().min(1),
  unitPrice: Joi.number().min(0),
  discountAmount: Joi.number().min(0),
  taxAmount: Joi.number().min(0),
  attributes: Joi.object().unknown(true),
  notes: Joi.string().max(1000).allow(''),
}).min(1);

// ========================
// Return Order Item
// ========================

export class ReturnOrderItemDto {
  quantity: number;
  reason?: string;
}

export const ReturnOrderItemSchema = Joi.object({
  quantity: Joi.number().required().integer().min(1),
  reason: Joi.string().max(500),
});

// ========================
// Query Order Items
// ========================

export class QueryOrderItemsDto {
  stockStatus?: string;
  sku?: string;
  page?: number;
  size?: number;
}

export const QueryOrderItemsSchema = Joi.object({
  stockStatus: Joi.string().valid('pending', 'fulfilled', 'cancelled', 'returned'),
  sku: Joi.string().max(100),
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(100).default(20),
});
