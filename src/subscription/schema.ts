import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Subscription Status
export enum SubscriptionStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended', // Invoice overdue
  CANCELLED = 'cancelled',
  TRIAL = 'trial',
}

// Invoice Status
export enum InvoiceStatus {
  PENDING = 'pending',     // Generated, awaiting payment
  PAID = 'paid',           // Payment received
  OVERDUE = 'overdue',     // Past due date, not paid
  CANCELLED = 'cancelled', // Invoice cancelled
}

// Store Subscription Schema
@Schema({ timestamps: true, versionKey: false, collection: 'subscriptions' })
export class Subscription extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, unique: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(SubscriptionStatus), default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Prop({ required: true, default: 19 })
  pricePerMonth: number; // $19 per store

  @Prop({ default: 'USD' })
  currency: string;

  // Billing cycle
  @Prop({ required: true })
  billingCycleStart: Date; // When the current billing cycle started

  @Prop({ required: true })
  nextInvoiceDate: Date; // When the next invoice will be generated (30 days after cycle start)

  @Prop()
  lastInvoiceDate?: Date; // When the last invoice was generated

  // Trial period (optional)
  @Prop()
  trialEndsAt?: Date;

  // Suspension info
  @Prop()
  suspendedAt?: Date;

  @Prop()
  suspensionReason?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type SubscriptionDocument = Subscription & Document;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Indexes
SubscriptionSchema.index({ organizationId: 1, status: 1 });
SubscriptionSchema.index({ nextInvoiceDate: 1, status: 1 }); // For cron job to find due invoices


// Invoice Schema
@Schema({ timestamps: true, versionKey: false, collection: 'invoices' })
export class Invoice extends Document {
  @Prop({ required: true, unique: true, index: true })
  invoiceNumber: string; // e.g., INV-2024-00001

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Subscription', required: true })
  subscriptionId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(InvoiceStatus), default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  // Billing period
  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  // Amount
  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  // Due date (when payment is expected)
  @Prop({ required: true })
  dueDate: Date;

  // Payment info
  @Prop()
  paidAt?: Date;

  @Prop()
  paymentMethod?: string;

  @Prop()
  paymentReference?: string;

  // Ziina Payment Intent
  @Prop()
  paymentIntentId?: string;

  @Prop()
  paymentUrl?: string;

  @Prop()
  paymentExpiresAt?: Date;

  // Store info snapshot (in case store name changes)
  @Prop()
  storeName?: string;

  @Prop()
  storeUrl?: string;

  // Organization info snapshot
  @Prop()
  organizationName?: string;

  @Prop()
  billingEmail?: string;

  // Notes
  @Prop()
  notes?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type InvoiceDocument = Invoice & Document;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// Indexes
InvoiceSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
InvoiceSchema.index({ storeId: 1, status: 1, createdAt: -1 });
InvoiceSchema.index({ dueDate: 1, status: 1 }); // For finding overdue invoices
InvoiceSchema.index({ invoiceNumber: 1 });
