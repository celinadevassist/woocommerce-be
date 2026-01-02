import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SKUStatus } from './enum';

// Bill of Materials sub-document
@Schema({ _id: false })
class BOMMaterial {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Material', required: true })
  materialId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unit: string;

  @Prop()
  notes?: string;
}

@Schema({ timestamps: true, versionKey: false, collection: 'inventory_skus' })
export class SKU extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  specs: Record<string, any>;

  @Prop({ default: '' })
  category: string;

  @Prop({ type: String, enum: Object.values(SKUStatus), default: SKUStatus.DRAFT })
  status: SKUStatus;

  @Prop({
    type: [{
      materialId: { type: MongooseSchema.Types.ObjectId, ref: 'Material', required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, required: true },
      notes: { type: String },
    }],
    default: [],
  })
  materials: BOMMaterial[];

  @Prop({ default: 0 })
  laborCost: number;

  @Prop({ default: 0 })
  overheadCost: number;

  @Prop({ default: false })
  fixedCost: boolean;

  @Prop({ default: 0 })
  cost: number;

  @Prop({ default: 0 })
  calculatedCost: number;

  @Prop({ default: 0 })
  sellingPrice: number;

  // Stock settings (for low stock alerts)
  @Prop({ default: 0 })
  minStockLevel: number;

  @Prop({ default: 0 })
  reorderPoint: number;

  @Prop({ default: 0 })
  reorderQuantity: number;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type SKUDocument = SKU & Document;

export const SKUSchema = SchemaFactory.createForClass(SKU);

// Indexes
// Partial unique index - only enforces uniqueness on non-deleted SKUs
SKUSchema.index(
  { storeId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
SKUSchema.index({ storeId: 1, status: 1 });
SKUSchema.index({ storeId: 1, category: 1 });
SKUSchema.index({ storeId: 1, title: 'text', sku: 'text' });
SKUSchema.index({ storeId: 1, isDeleted: 1 });
