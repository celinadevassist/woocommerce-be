import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
  OrderStatus,
  PaymentStatus,
  FulfillmentStatus,
  OrderSource,
} from './enum';

// Sub-schema for address
@Schema({ _id: false })
export class OrderAddress {
  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  company?: string;

  @Prop()
  address1: string;

  @Prop()
  address2?: string;

  @Prop()
  city: string;

  @Prop()
  state?: string;

  @Prop()
  postcode: string;

  @Prop()
  country: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;
}

export const OrderAddressSchema = SchemaFactory.createForClass(OrderAddress);

// Sub-schema for order line items
@Schema({ _id: false })
export class OrderLineItem {
  @Prop({ required: true })
  externalId: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  productId?: number;

  @Prop()
  variationId?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  localProductId?: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant' })
  localVariantId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, default: 1 })
  quantity: number;

  @Prop()
  sku?: string;

  @Prop()
  image?: string;

  @Prop()
  price: number;

  @Prop()
  subtotal: string;

  @Prop()
  subtotalTax: string;

  @Prop()
  total: string;

  @Prop()
  totalTax: string;

  @Prop()
  taxClass?: string;

  @Prop({ type: Object })
  metaData?: Record<string, any>;

  @Prop({ type: Object })
  attributes?: Record<string, string>;

  // Unit tracking for fulfillment
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'ProductUnit' }],
    default: [],
  })
  fulfilledUnits: MongooseSchema.Types.ObjectId[];

  @Prop({ default: 0 })
  fulfilledQuantity: number;
}

export const OrderLineItemSchema = SchemaFactory.createForClass(OrderLineItem);

// Sub-schema for shipping lines
@Schema({ _id: false })
export class ShippingLine {
  @Prop()
  externalId: number;

  @Prop()
  methodTitle: string;

  @Prop()
  methodId: string;

  @Prop()
  total: string;

  @Prop()
  totalTax: string;
}

export const ShippingLineSchema = SchemaFactory.createForClass(ShippingLine);

// Sub-schema for fee lines
@Schema({ _id: false })
export class FeeLine {
  @Prop()
  externalId: number;

  @Prop()
  name: string;

  @Prop()
  total: string;

  @Prop()
  totalTax: string;
}

export const FeeLineSchema = SchemaFactory.createForClass(FeeLine);

// Sub-schema for coupon lines
@Schema({ _id: false })
export class CouponLine {
  @Prop()
  externalId: number;

  @Prop()
  code: string;

  @Prop()
  discount: string;

  @Prop()
  discountTax: string;
}

export const CouponLineSchema = SchemaFactory.createForClass(CouponLine);

// Sub-schema for refunds
@Schema({ _id: false })
export class OrderRefund {
  @Prop()
  externalId: number;

  @Prop()
  reason?: string;

  @Prop()
  total: string;

  @Prop()
  refundedAt: Date;
}

export const OrderRefundSchema = SchemaFactory.createForClass(OrderRefund);

// Sub-schema for order notes
@Schema({ _id: true })
export class OrderNote {
  @Prop({ required: true })
  content: string;

  @Prop({ default: false })
  isCustomerNote: boolean;

  @Prop()
  addedBy?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  addedByUserId?: MongooseSchema.Types.ObjectId;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const OrderNoteSchema = SchemaFactory.createForClass(OrderNote);

@Schema({ timestamps: true, versionKey: false, collection: 'orders' })
export class Order extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  // For WooCommerce orders - required for synced orders
  @Prop({ index: true })
  externalId?: number;

  @Prop({ required: true })
  orderNumber: string;

  // Internal order number for manual orders (CF-{storePrefix}-{seq})
  @Prop()
  internalOrderNumber?: string;

  // Order source - woocommerce, manual, api
  @Prop({
    type: String,
    enum: Object.values(OrderSource),
    default: OrderSource.WOOCOMMERCE,
  })
  source: OrderSource;

  // Use separate OrderItems collection (true for new orders)
  @Prop({ default: false })
  useSeparateItems: boolean;

  @Prop()
  orderKey?: string;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Prop({
    type: String,
    enum: Object.values(FulfillmentStatus),
    default: FulfillmentStatus.UNFULFILLED,
  })
  fulfillmentStatus: FulfillmentStatus;

  @Prop({ required: true })
  currency: string;

  @Prop()
  currencySymbol?: string;

  @Prop()
  paidCurrency?: string;

  @Prop()
  paidTotal?: string;

  @Prop()
  conversionRate?: number;

  @Prop({ default: false })
  pricesIncludeTax: boolean;

  @Prop()
  discountTotal: string;

  @Prop()
  discountTax: string;

  @Prop()
  shippingTotal: string;

  @Prop()
  shippingTax: string;

  @Prop()
  cartTax: string;

  @Prop({ required: true })
  total: string;

  @Prop()
  totalTax: string;

  // Customer info
  @Prop()
  customerId?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
  localCustomerId?: MongooseSchema.Types.ObjectId;

  @Prop()
  customerNote?: string;

  @Prop({ type: OrderAddressSchema })
  billing: OrderAddress;

  @Prop({ type: OrderAddressSchema })
  shipping: OrderAddress;

  // Payment
  @Prop()
  paymentMethod?: string;

  @Prop()
  paymentMethodTitle?: string;

  @Prop()
  transactionId?: string;

  @Prop()
  datePaid?: Date;

  @Prop()
  dateCompleted?: Date;

  // Line items
  @Prop({ type: [OrderLineItemSchema], default: [] })
  lineItems: OrderLineItem[];

  @Prop({ type: [ShippingLineSchema], default: [] })
  shippingLines: ShippingLine[];

  @Prop({ type: [FeeLineSchema], default: [] })
  feeLines: FeeLine[];

  @Prop({ type: [CouponLineSchema], default: [] })
  couponLines: CouponLine[];

  @Prop({ type: [OrderRefundSchema], default: [] })
  refunds: OrderRefund[];

  // Calculated totals from OrderItems (when useSeparateItems = true)
  @Prop({ default: 0 })
  itemsCount: number;

  @Prop({ default: 0 })
  itemsQuantity: number;

  @Prop({ default: 0 })
  itemsSubtotal: number;

  // Manual order workflow timestamps
  @Prop()
  confirmedAt?: Date;

  @Prop()
  shippedAt?: Date;

  @Prop()
  deliveredAt?: Date;

  // Who created the manual order
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdByUserId?: MongooseSchema.Types.ObjectId;

  // WooCommerce metadata
  @Prop()
  createdVia?: string;

  @Prop()
  dateCreatedWoo?: Date;

  @Prop()
  dateModifiedWoo?: Date;

  @Prop()
  lastSyncedAt?: Date;

  // Internal tracking
  @Prop()
  trackingNumber?: string;

  @Prop()
  trackingCarrier?: string;

  @Prop()
  trackingUrl?: string;

  @Prop()
  internalNotes?: string;

  @Prop({ type: [OrderNoteSchema], default: [] })
  notes: OrderNote[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type OrderDocument = Order & Document;

export const OrderSchema = SchemaFactory.createForClass(Order);

// Indexes
// Unique constraint only for WooCommerce orders (where externalId exists)
OrderSchema.index(
  { storeId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $exists: true } } },
);
OrderSchema.index({ storeId: 1, orderNumber: 1 }, { unique: true });
OrderSchema.index({ storeId: 1, internalOrderNumber: 1 });
OrderSchema.index({ storeId: 1, status: 1 });
OrderSchema.index({ storeId: 1, source: 1 });
OrderSchema.index({ customerId: 1 });
OrderSchema.index({ localCustomerId: 1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ dateCreatedWoo: -1 });
OrderSchema.index({ 'billing.email': 1 });
OrderSchema.index({ 'billing.phone': 1 });
