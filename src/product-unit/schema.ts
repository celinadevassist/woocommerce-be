import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ProductUnitStatus } from './enum';

@Schema({ timestamps: true, collection: 'product_units' })
export class ProductUnit extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  rfidCode: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SKU', required: true, index: true })
  skuId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  sku: string;

  @Prop({ type: String, required: true })
  productName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductionBatch', required: true, index: true })
  batchId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true })
  batchNumber: string;

  @Prop({ type: Number, required: true })
  unitCost: number;

  @Prop({ type: String, enum: Object.values(ProductUnitStatus), default: ProductUnitStatus.IN_STOCK, index: true })
  status: ProductUnitStatus;

  @Prop({ type: String, default: '' })
  location: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order' })
  orderId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String })
  orderNumber: string;

  @Prop({ type: Date })
  soldAt: Date;

  // Hold tracking
  @Prop({ type: String })
  holdReason: string;

  @Prop({ type: Date })
  holdAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  holdByUserId: MongooseSchema.Types.ObjectId;

  // Damaged tracking
  @Prop({ type: String })
  damagedReason: string;

  @Prop({ type: Date })
  damagedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  damagedByUserId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Date, required: true })
  productionDate: Date;

  @Prop({ type: String })
  notes: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export type ProductUnitDocument = ProductUnit & Document;

export const ProductUnitSchema = SchemaFactory.createForClass(ProductUnit);

// Compound index for inventory queries (available units per SKU)
ProductUnitSchema.index({ storeId: 1, skuId: 1, status: 1 });

// Optimized index for stock aggregation queries (includes isDeleted for filtering)
ProductUnitSchema.index({ storeId: 1, isDeleted: 1, skuId: 1, status: 1 });

// RFID lookup per store
ProductUnitSchema.index({ storeId: 1, rfidCode: 1 });

// Batch traceability
ProductUnitSchema.index({ batchId: 1 });

// Order fulfillment lookup
ProductUnitSchema.index({ orderId: 1 });

// FIFO queries (oldest in_stock units first)
ProductUnitSchema.index({ storeId: 1, skuId: 1, status: 1, createdAt: 1 });

// Soft delete filter
ProductUnitSchema.index({ storeId: 1, isDeleted: 1 });
