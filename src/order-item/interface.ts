import { Types } from 'mongoose';
import { OrderItemStockStatus, OrderItemSource } from './enum';

export interface IOrderItem {
  _id?: Types.ObjectId;
  storeId: Types.ObjectId;
  orderId: Types.ObjectId;

  // Product references
  productId?: Types.ObjectId;
  variantId?: Types.ObjectId;
  skuId?: Types.ObjectId;
  sku?: string;

  // WooCommerce compatibility
  externalId?: number;
  externalProductId?: number;
  externalVariationId?: number;

  // Item details
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  subtotal: number;
  total: number;

  // Stock tracking
  stockStatus: OrderItemStockStatus;
  fulfilledUnits: Types.ObjectId[];
  fulfilledQuantity: number;
  returnedQuantity: number;

  // Metadata
  attributes?: Record<string, any>;
  notes?: string;
  source: OrderItemSource;
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IOrderItemCreate {
  storeId: string;
  orderId: string;

  // Product references (optional - can add item by name only)
  productId?: string;
  variantId?: string;
  skuId?: string;
  sku?: string;

  // Item details
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;

  // Metadata
  attributes?: Record<string, any>;
  notes?: string;
  source?: OrderItemSource;
}

export interface IOrderItemUpdate {
  name?: string;
  quantity?: number;
  unitPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  attributes?: Record<string, any>;
  notes?: string;
}

export interface IOrderItemBulkCreate {
  storeId: string;
  orderId: string;
  items: Array<{
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
  }>;
  source?: OrderItemSource;
}

export interface IOrderTotals {
  itemsCount: number;
  itemsQuantity: number;
  itemsSubtotal: number;
  itemsDiscount: number;
  itemsTax: number;
  itemsTotal: number;
}
