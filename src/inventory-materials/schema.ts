import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
  MaterialUnit,
  MaterialTransactionType,
  MaterialTransactionReferenceType,
} from './enum';

// Supplier sub-document
class Supplier {
  @Prop({ required: true })
  name: string;

  @Prop()
  contactPerson?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  notes?: string;
}

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'inventory_materials',
})
export class Material extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, enum: Object.values(MaterialUnit), required: true })
  unit: MaterialUnit;

  @Prop({ default: '' })
  category: string;

  @Prop({ default: 0 })
  minStockLevel: number;

  @Prop({ default: 0 })
  reorderPoint: number;

  @Prop({ default: 0 })
  reorderQuantity: number;

  @Prop({
    type: [
      {
        name: String,
        contactPerson: String,
        email: String,
        phone: String,
        notes: String,
      },
    ],
    default: [],
  })
  suppliers: Supplier[];

  @Prop({ default: 0 })
  currentStock: number;

  @Prop({ default: 0 })
  averageCost: number;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type MaterialDocument = Material & Document;

export const MaterialSchema = SchemaFactory.createForClass(Material);

// Indexes
MaterialSchema.index({ storeId: 1, sku: 1 }, { unique: true });
MaterialSchema.index({ storeId: 1, category: 1 });
MaterialSchema.index({ storeId: 1, currentStock: 1, minStockLevel: 1 });
MaterialSchema.index({ storeId: 1, name: 'text', sku: 'text' });

// Material Transaction Schema
@Schema({
  timestamps: false,
  versionKey: false,
  collection: 'inventory_material_transactions',
})
export class MaterialTransaction extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Material',
    required: true,
    index: true,
  })
  materialId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(MaterialTransactionType),
    required: true,
  })
  type: MaterialTransactionType;

  @Prop({ required: true })
  quantity: number;

  @Prop()
  unitCost?: number;

  @Prop({ required: true })
  totalCost: number;

  @Prop({ required: true })
  previousStock: number;

  @Prop({ required: true })
  newStock: number;

  @Prop()
  previousAvgCost?: number;

  @Prop()
  newAvgCost?: number;

  @Prop()
  reference?: string;

  @Prop({
    type: String,
    enum: Object.values(MaterialTransactionReferenceType),
    required: true,
  })
  referenceType: MaterialTransactionReferenceType;

  @Prop()
  notes?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  performedBy: MongooseSchema.Types.ObjectId;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export type MaterialTransactionDocument = MaterialTransaction & Document;

export const MaterialTransactionSchema =
  SchemaFactory.createForClass(MaterialTransaction);

// Indexes
MaterialTransactionSchema.index({ materialId: 1, createdAt: -1 });
MaterialTransactionSchema.index({ storeId: 1, type: 1, createdAt: -1 });
MaterialTransactionSchema.index({ referenceType: 1, reference: 1 });
