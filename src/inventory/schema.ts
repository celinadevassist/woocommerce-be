import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { InventoryChangeType, AlertType, AlertStatus } from './enum';

@Schema({ timestamps: true, versionKey: false, collection: 'inventory_logs' })
export class InventoryLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant' })
  variantId?: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  previousQuantity: number;

  @Prop({ required: true })
  newQuantity: number;

  @Prop()
  quantityChange: number;

  @Prop({ type: String, enum: Object.values(InventoryChangeType), required: true })
  changeType: InventoryChangeType;

  @Prop()
  reason?: string;

  @Prop()
  reference?: string; // Order ID, Sync Job ID, etc.

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  changedBy?: MongooseSchema.Types.ObjectId;

  @Prop()
  sku?: string;

  @Prop()
  productName?: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export type InventoryLogDocument = InventoryLog & Document;

export const InventoryLogSchema = SchemaFactory.createForClass(InventoryLog);

// Indexes
InventoryLogSchema.index({ productId: 1, createdAt: -1 });
InventoryLogSchema.index({ storeId: 1, createdAt: -1 });
InventoryLogSchema.index({ organizationId: 1, createdAt: -1 });
InventoryLogSchema.index({ changeType: 1, createdAt: -1 });

// Stock Alert schema
@Schema({ timestamps: true, versionKey: false, collection: 'stock_alerts' })
export class StockAlert extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductVariant' })
  variantId?: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(AlertType), required: true })
  alertType: AlertType;

  @Prop({ type: String, enum: Object.values(AlertStatus), default: AlertStatus.ACTIVE })
  status: AlertStatus;

  @Prop({ required: true })
  currentQuantity: number;

  @Prop()
  threshold?: number;

  @Prop()
  sku?: string;

  @Prop()
  productName?: string;

  @Prop()
  resolvedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  dismissedBy?: MongooseSchema.Types.ObjectId;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type StockAlertDocument = StockAlert & Document;

export const StockAlertSchema = SchemaFactory.createForClass(StockAlert);

// Indexes
StockAlertSchema.index({ storeId: 1, status: 1 });
StockAlertSchema.index({ organizationId: 1, status: 1 });
StockAlertSchema.index({ productId: 1, alertType: 1, status: 1 }, { unique: true });
