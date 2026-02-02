import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { FulfillmentStatus, OrderStatus, PaymentStatus } from './enum';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    description: 'Order status (WooCommerce status)',
    enum: OrderStatus,
  })
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Sync status change to WooCommerce',
    default: true,
  })
  syncToStore?: boolean;

  @ApiPropertyOptional({
    description: 'Payment status',
    enum: PaymentStatus,
  })
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Fulfillment status',
    enum: FulfillmentStatus,
  })
  fulfillmentStatus?: FulfillmentStatus;

  @ApiPropertyOptional({ description: 'Tracking number' })
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Tracking carrier' })
  trackingCarrier?: string;

  @ApiPropertyOptional({ description: 'Tracking URL' })
  trackingUrl?: string;

  @ApiPropertyOptional({ description: 'Internal notes' })
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Tags', type: [String] })
  tags?: string[];
}

export const UpdateOrderSchema = Joi.object().keys({
  status: Joi.string()
    .valid(...Object.values(OrderStatus))
    .optional(),
  syncToStore: Joi.boolean().default(true).optional(),
  paymentStatus: Joi.string()
    .valid(...Object.values(PaymentStatus))
    .optional(),
  fulfillmentStatus: Joi.string()
    .valid(...Object.values(FulfillmentStatus))
    .optional(),
  trackingNumber: Joi.string().optional(),
  trackingCarrier: Joi.string().optional(),
  trackingUrl: Joi.string().uri().optional(),
  internalNotes: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
});

export class AddTrackingDto {
  @ApiPropertyOptional({ description: 'Tracking number' })
  trackingNumber: string;

  @ApiPropertyOptional({ description: 'Tracking carrier' })
  trackingCarrier: string;

  @ApiPropertyOptional({ description: 'Tracking URL' })
  trackingUrl?: string;
}

export const AddTrackingSchema = Joi.object().keys({
  trackingNumber: Joi.string().required(),
  trackingCarrier: Joi.string().required(),
  trackingUrl: Joi.string().uri().optional(),
});

export class AddOrderNoteDto {
  @ApiPropertyOptional({ description: 'Note content', required: true })
  content: string;

  @ApiPropertyOptional({
    description: 'Is this a customer-visible note?',
    default: false,
  })
  isCustomerNote?: boolean;
}

export const AddOrderNoteSchema = Joi.object().keys({
  content: Joi.string().required().min(1).max(5000),
  isCustomerNote: Joi.boolean().default(false),
});

export class BulkUpdateStatusDto {
  @ApiPropertyOptional({
    description: 'Order IDs to update',
    type: [String],
    required: true,
  })
  orderIds: string[];

  @ApiPropertyOptional({
    description: 'New status',
    enum: OrderStatus,
    required: true,
  })
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Sync to WooCommerce', default: true })
  syncToStore?: boolean;
}

export const BulkUpdateStatusSchema = Joi.object().keys({
  orderIds: Joi.array().items(Joi.string()).min(1).required(),
  status: Joi.string()
    .valid(...Object.values(OrderStatus))
    .required(),
  syncToStore: Joi.boolean().default(true),
});

export class CreateRefundDto {
  @ApiPropertyOptional({ description: 'Refund amount', required: true })
  amount: string;

  @ApiPropertyOptional({ description: 'Refund reason' })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Sync refund to WooCommerce',
    default: true,
  })
  syncToStore?: boolean;

  @ApiPropertyOptional({
    description: 'Process refund via payment gateway (if supported)',
    default: false,
  })
  apiRefund?: boolean;
}

export const CreateRefundSchema = Joi.object().keys({
  amount: Joi.string()
    .required()
    .pattern(/^\d+(\.\d{1,2})?$/),
  reason: Joi.string().max(500).optional(),
  syncToStore: Joi.boolean().default(true),
  apiRefund: Joi.boolean().default(false),
});

// ========================
// Batch Order DTOs
// ========================

const AddressSchema = Joi.object({
  first_name: Joi.string().optional().allow(''),
  last_name: Joi.string().optional().allow(''),
  company: Joi.string().optional().allow(''),
  address_1: Joi.string().optional().allow(''),
  address_2: Joi.string().optional().allow(''),
  city: Joi.string().optional().allow(''),
  state: Joi.string().optional().allow(''),
  postcode: Joi.string().optional().allow(''),
  country: Joi.string().optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  phone: Joi.string().optional().allow(''),
});

const LineItemSchema = Joi.object({
  product_id: Joi.number().optional(),
  variation_id: Joi.number().optional(),
  quantity: Joi.number().integer().min(1).optional(),
  price: Joi.string().optional(),
});

const ShippingLineSchema = Joi.object({
  method_id: Joi.string().optional(),
  method_title: Joi.string().optional(),
  total: Joi.string().optional(),
});

const FeeLineSchema = Joi.object({
  name: Joi.string().optional(),
  total: Joi.string().optional(),
});

const CouponLineSchema = Joi.object({
  code: Joi.string().required(),
});

const MetaDataSchema = Joi.object({
  key: Joi.string().required(),
  value: Joi.string().required(),
});

export class BatchCreateOrderItemDto {
  payment_method?: string;
  payment_method_title?: string;
  set_paid?: boolean;
  billing?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    email?: string;
    phone?: string;
  };
  shipping?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items?: Array<{
    product_id?: number;
    variation_id?: number;
    quantity?: number;
    price?: string;
  }>;
  shipping_lines?: Array<{
    method_id?: string;
    method_title?: string;
    total?: string;
  }>;
  fee_lines?: Array<{
    name?: string;
    total?: string;
  }>;
  coupon_lines?: Array<{
    code?: string;
  }>;
  customer_id?: number;
  customer_note?: string;
  status?: string;
  meta_data?: Array<{ key: string; value: string }>;
}

// Valid statuses for batch operations (CartFlow + WooCommerce)
const VALID_BATCH_STATUSES = [
  // WooCommerce statuses
  'pending',
  'processing',
  'on-hold',
  'completed',
  'cancelled',
  'refunded',
  'failed',
  'trash',
  // CartFlow-specific statuses (will be mapped to WooCommerce statuses)
  'draft',
  'confirmed',
  'shipped',
  'delivered',
];

export const BatchCreateOrderItemSchema = Joi.object({
  payment_method: Joi.string().optional(),
  payment_method_title: Joi.string().optional(),
  set_paid: Joi.boolean().optional(),
  billing: AddressSchema.optional(),
  shipping: AddressSchema.keys({
    email: Joi.forbidden(),
    phone: Joi.forbidden(),
  }).optional(),
  line_items: Joi.array().items(LineItemSchema).optional(),
  shipping_lines: Joi.array().items(ShippingLineSchema).optional(),
  fee_lines: Joi.array().items(FeeLineSchema).optional(),
  coupon_lines: Joi.array().items(CouponLineSchema).optional(),
  customer_id: Joi.number().integer().optional(),
  customer_note: Joi.string().optional().allow(''),
  status: Joi.string()
    .valid(...VALID_BATCH_STATUSES)
    .optional(),
  meta_data: Joi.array().items(MetaDataSchema).optional(),
});

export class BatchUpdateOrderItemDto {
  id: number;
  status?: string;
  billing?: any;
  shipping?: any;
  line_items?: any[];
  shipping_lines?: any[];
  fee_lines?: any[];
  coupon_lines?: any[];
  customer_note?: string;
  meta_data?: Array<{ key: string; value: string }>;
}

export const BatchUpdateOrderItemSchema = Joi.object({
  id: Joi.number().integer().required(),
  status: Joi.string()
    .valid(...VALID_BATCH_STATUSES)
    .optional(),
  billing: AddressSchema.optional(),
  shipping: AddressSchema.keys({
    email: Joi.forbidden(),
    phone: Joi.forbidden(),
  }).optional(),
  line_items: Joi.array()
    .items(LineItemSchema.keys({ id: Joi.number().optional() }))
    .optional(),
  shipping_lines: Joi.array()
    .items(ShippingLineSchema.keys({ id: Joi.number().optional() }))
    .optional(),
  fee_lines: Joi.array()
    .items(FeeLineSchema.keys({ id: Joi.number().optional() }))
    .optional(),
  coupon_lines: Joi.array()
    .items(CouponLineSchema.keys({ id: Joi.number().optional() }))
    .optional(),
  customer_note: Joi.string().optional().allow(''),
  meta_data: Joi.array().items(MetaDataSchema).optional(),
});

export class BatchOrdersDto {
  storeId: string;
  create?: BatchCreateOrderItemDto[];
  update?: BatchUpdateOrderItemDto[];
  delete?: number[];
}

export const BatchOrdersSchema = Joi.object({
  storeId: Joi.string().required(),
  create: Joi.array().items(BatchCreateOrderItemSchema).optional(),
  update: Joi.array().items(BatchUpdateOrderItemSchema).optional(),
  delete: Joi.array().items(Joi.number().integer()).optional(),
}).or('create', 'update', 'delete');
