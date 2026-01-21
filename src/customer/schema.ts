import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CustomerStatus, CustomerSource, CustomerTier } from './enum';

// Address sub-schema (reusable)
@Schema({ _id: false })
export class CustomerAddress {
  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  company?: string;

  @Prop()
  address1?: string;

  @Prop()
  address2?: string;

  @Prop()
  city?: string;

  @Prop()
  state?: string;

  @Prop()
  postcode?: string;

  @Prop()
  country?: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;
}

export const CustomerAddressSchema =
  SchemaFactory.createForClass(CustomerAddress);

// Customer stats sub-schema
@Schema({ _id: false })
export class CustomerStats {
  @Prop({ default: 0 })
  ordersCount: number;

  @Prop({ default: 0 })
  totalSpent: number;

  @Prop()
  averageOrderValue?: number;

  @Prop()
  lastOrderDate?: Date;

  @Prop()
  firstOrderDate?: Date;
}

export const CustomerStatsSchema = SchemaFactory.createForClass(CustomerStats);

// Customer note sub-schema
@Schema({ _id: true })
export class CustomerNote {
  @Prop({ required: true })
  content: string;

  @Prop()
  addedBy?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  addedByUserId?: MongooseSchema.Types.ObjectId;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const CustomerNoteSchema = SchemaFactory.createForClass(CustomerNote);

@Schema({ timestamps: true, versionKey: false, collection: 'customers' })
export class Customer extends Document {
  // WooCommerce reference
  @Prop({ required: true, index: true })
  externalId: number;

  // Store reference
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  // Basic info - email is optional (customer can be identified by phone only)
  @Prop({ index: true })
  email?: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  username?: string;

  @Prop({ index: true })
  phone?: string; // Primary phone - full list in separate phones collection

  @Prop()
  avatarUrl?: string;

  // Addresses
  @Prop({ type: CustomerAddressSchema })
  billing?: CustomerAddress;

  @Prop({ type: CustomerAddressSchema })
  shipping?: CustomerAddress;

  // Status & classification
  @Prop({
    type: String,
    enum: Object.values(CustomerStatus),
    default: CustomerStatus.ACTIVE,
  })
  status: CustomerStatus;

  @Prop({
    type: String,
    enum: Object.values(CustomerSource),
    default: CustomerSource.WOOCOMMERCE,
  })
  source: CustomerSource;

  @Prop({
    type: String,
    enum: Object.values(CustomerTier),
    default: CustomerTier.REGULAR,
  })
  tier: CustomerTier;

  // Stats (computed from orders)
  @Prop({ type: CustomerStatsSchema, default: {} })
  stats: CustomerStats;

  // WooCommerce metadata
  @Prop()
  role?: string;

  @Prop({ default: false })
  isPayingCustomer: boolean;

  @Prop()
  wooCreatedAt?: Date;

  @Prop()
  wooModifiedAt?: Date;

  // Internal fields
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [CustomerNoteSchema], default: [] })
  notes: CustomerNote[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type CustomerDocument = Customer & Document;

export const CustomerSchema = SchemaFactory.createForClass(Customer);

// Indexes
// Unique index for WooCommerce customers (externalId > 0), allows multiple guests with externalId = 0
CustomerSchema.index(
  { storeId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $gt: 0 } } },
);
// Unique index for customers by email within a store (only when email exists and is not empty)
CustomerSchema.index(
  { storeId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $nin: [null, ''] } },
  },
);
// Unique index for primary phone within a store (only when phone exists and is not empty)
CustomerSchema.index(
  { storeId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $exists: true, $nin: [null, ''] } },
  },
);
CustomerSchema.index({ storeId: 1, createdAt: -1 });
CustomerSchema.index({ status: 1, tier: 1 });
CustomerSchema.index({ 'stats.ordersCount': -1 });
CustomerSchema.index({ 'stats.totalSpent': -1 });
CustomerSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });
