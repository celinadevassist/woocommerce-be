import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { FulfillmentStatus, OrderStatus } from './enum';

export class UpdateOrderDto {
  @ApiPropertyOptional({ description: 'Order status (WooCommerce status)', enum: OrderStatus })
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Sync status change to WooCommerce', default: true })
  syncToStore?: boolean;

  @ApiPropertyOptional({ description: 'Fulfillment status', enum: FulfillmentStatus })
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
  status: Joi.string().valid(...Object.values(OrderStatus)).optional(),
  syncToStore: Joi.boolean().default(true).optional(),
  fulfillmentStatus: Joi.string().valid(...Object.values(FulfillmentStatus)).optional(),
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

  @ApiPropertyOptional({ description: 'Is this a customer-visible note?', default: false })
  isCustomerNote?: boolean;
}

export const AddOrderNoteSchema = Joi.object().keys({
  content: Joi.string().required().min(1).max(5000),
  isCustomerNote: Joi.boolean().default(false),
});

export class BulkUpdateStatusDto {
  @ApiPropertyOptional({ description: 'Order IDs to update', type: [String], required: true })
  orderIds: string[];

  @ApiPropertyOptional({ description: 'New status', enum: OrderStatus, required: true })
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Sync to WooCommerce', default: true })
  syncToStore?: boolean;
}

export const BulkUpdateStatusSchema = Joi.object().keys({
  orderIds: Joi.array().items(Joi.string()).min(1).required(),
  status: Joi.string().valid(...Object.values(OrderStatus)).required(),
  syncToStore: Joi.boolean().default(true),
});

export class CreateRefundDto {
  @ApiPropertyOptional({ description: 'Refund amount', required: true })
  amount: string;

  @ApiPropertyOptional({ description: 'Refund reason' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Sync refund to WooCommerce', default: true })
  syncToStore?: boolean;

  @ApiPropertyOptional({ description: 'Process refund via payment gateway (if supported)', default: false })
  apiRefund?: boolean;
}

export const CreateRefundSchema = Joi.object().keys({
  amount: Joi.string().required().pattern(/^\d+(\.\d{1,2})?$/),
  reason: Joi.string().max(500).optional(),
  syncToStore: Joi.boolean().default(true),
  apiRefund: Joi.boolean().default(false),
});
