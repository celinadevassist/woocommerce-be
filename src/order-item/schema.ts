import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { OrderItemStockStatus, OrderItemSource } from './enum';

@Schema({ timestamps: true, versionKey: false, collection: 'order_items' })
export class OrderItem extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  })
  orderId: MongooseSchema.Types.ObjectId;

  // Product references
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  productId?: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant' })
  variantId?: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SKU' })
  skuId?: MongooseSchema.Types.ObjectId;

  @Prop({ index: true })
  sku?: string;

  // WooCommerce compatibility
  @Prop()
  externalId?: number;

  @Prop()
  externalProductId?: number;

  @Prop()
  externalVariationId?: number;

  // Item details
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ default: 0 })
  discountAmount: number;

  @Prop({ default: 0 })
  taxAmount: number;

  @Prop({ required: true })
  subtotal: number;

  @Prop({ required: true })
  total: number;

  // Stock tracking
  @Prop({
    type: String,
    enum: Object.values(OrderItemStockStatus),
    default: OrderItemStockStatus.PENDING,
  })
  stockStatus: OrderItemStockStatus;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'ProductUnit' }],
    default: [],
  })
  fulfilledUnits: MongooseSchema.Types.ObjectId[];

  @Prop({ default: 0 })
  fulfilledQuantity: number;

  @Prop({ default: 0 })
  returnedQuantity: number;

  // Metadata
  @Prop({ type: Object })
  attributes?: Record<string, any>;

  @Prop()
  notes?: string;

  @Prop({
    type: String,
    enum: Object.values(OrderItemSource),
    default: OrderItemSource.MANUAL,
  })
  source: OrderItemSource;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type OrderItemDocument = OrderItem & Document;

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

// Indexes
OrderItemSchema.index({ storeId: 1, orderId: 1 });
OrderItemSchema.index({ orderId: 1, isDeleted: 1 });
OrderItemSchema.index({ storeId: 1, sku: 1 });
OrderItemSchema.index({ stockStatus: 1 });
