import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CostType, CostCategory } from './enum';

@Schema({ timestamps: true })
export class CostTemplate extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ required: true, enum: Object.values(CostType), default: CostType.FIXED })
  type: CostType;

  @Prop({ required: true, enum: Object.values(CostCategory), default: CostCategory.OTHER })
  category: CostCategory;

  @Prop({ required: true, default: 0, min: 0 })
  defaultAmount: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const CostTemplateSchema = SchemaFactory.createForClass(CostTemplate);

// Indexes
CostTemplateSchema.index({ storeId: 1, isDeleted: 1 });
CostTemplateSchema.index({ storeId: 1, category: 1 });
CostTemplateSchema.index({ storeId: 1, name: 1 }, { unique: true });

@Schema({ timestamps: true })
export class CostEntry extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CostTemplate' })
  templateId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: Object.values(CostType), default: CostType.FIXED })
  type: CostType;

  @Prop({ required: true, enum: Object.values(CostCategory), default: CostCategory.OTHER })
  category: CostCategory;

  @Prop({ required: true })
  month: string; // Format: 'YYYY-MM'

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: Date })
  paidAt: Date;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const CostEntrySchema = SchemaFactory.createForClass(CostEntry);

// Indexes
CostEntrySchema.index({ storeId: 1, month: 1, isDeleted: 1 });
CostEntrySchema.index({ storeId: 1, category: 1, month: 1 });
CostEntrySchema.index({ storeId: 1, templateId: 1, month: 1 });
CostEntrySchema.index({ storeId: 1, type: 1, month: 1 });
