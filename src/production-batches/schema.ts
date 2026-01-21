import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ProductionBatchStatus, ProductionBatchType } from './enum';

// Consumed Material subdocument
@Schema({ _id: false })
export class ConsumedMaterial {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Material',
    required: true,
  })
  materialId: MongooseSchema.Types.ObjectId;

  @Prop({ type: Number, required: true })
  plannedQuantity: number;

  @Prop({ type: Number })
  actualQuantity: number;

  @Prop({ type: String, required: true })
  unit: string;

  @Prop({ type: Number, default: 0 })
  unitCost: number;

  @Prop({ type: Number, default: 0 })
  totalCost: number;
}

export const ConsumedMaterialSchema =
  SchemaFactory.createForClass(ConsumedMaterial);

// Production Batch schema
@Schema({ timestamps: true, collection: 'production_batches' })
export class ProductionBatch extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true })
  batchNumber: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SKU',
    required: true,
    index: true,
  })
  skuId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ProductionBatchType),
    default: ProductionBatchType.STANDARD,
  })
  type: ProductionBatchType;

  @Prop({
    type: String,
    enum: Object.values(ProductionBatchStatus),
    default: ProductionBatchStatus.PLANNED,
  })
  status: ProductionBatchStatus;

  @Prop({ type: Number, required: true, min: 1 })
  plannedQuantity: number;

  @Prop({ type: Number, default: 0 })
  completedQuantity: number;

  @Prop({ type: Number, default: 0 })
  defectQuantity: number;

  @Prop({ type: [ConsumedMaterialSchema], default: [] })
  consumedMaterials: ConsumedMaterial[];

  @Prop({ type: Number, default: 0 })
  laborCost: number;

  @Prop({ type: Number, default: 0 })
  overheadCost: number;

  @Prop({ type: Number, default: 0 })
  totalCost: number;

  @Prop({ type: Number, default: 0 })
  costPerUnit: number;

  @Prop({ type: String })
  notes: string;

  @Prop({ type: Date })
  plannedStartDate: Date;

  @Prop({ type: Date })
  actualStartDate: Date;

  @Prop({ type: Date })
  completedDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const ProductionBatchSchema =
  SchemaFactory.createForClass(ProductionBatch);

// Compound index for batch number uniqueness per store
ProductionBatchSchema.index({ storeId: 1, batchNumber: 1 }, { unique: true });

// Index for status queries
ProductionBatchSchema.index({ storeId: 1, status: 1 });

// Index for date range queries
ProductionBatchSchema.index({ storeId: 1, plannedStartDate: 1 });
