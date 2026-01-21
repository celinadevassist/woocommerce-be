import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  AssetCategory,
  AssetStatus,
  MaintenanceType,
  DepreciationMethod,
} from './enum';

@Schema({ _id: false })
export class Warranty {
  @Prop({ type: Date })
  expiresAt: Date;

  @Prop({ trim: true })
  provider: string;

  @Prop({ trim: true })
  notes: string;
}

export const WarrantySchema = SchemaFactory.createForClass(Warranty);

@Schema({ timestamps: true })
export class MaintenanceLog {
  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ required: true, enum: Object.values(MaintenanceType) })
  type: MaintenanceType;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ default: 0, min: 0 })
  cost: number;

  @Prop({ trim: true })
  performedBy: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const MaintenanceLogSchema =
  SchemaFactory.createForClass(MaintenanceLog);

@Schema({ timestamps: true })
export class FixedAsset extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  assetTag: string;

  @Prop({
    required: true,
    enum: Object.values(AssetCategory),
    default: AssetCategory.OTHER,
  })
  category: AssetCategory;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ trim: true, default: '' })
  serialNumber: string;

  @Prop({ type: Date, required: true })
  purchaseDate: Date;

  @Prop({ required: true, min: 0 })
  purchaseCost: number;

  @Prop({ trim: true, default: '' })
  supplier: string;

  @Prop({
    required: true,
    enum: Object.values(AssetStatus),
    default: AssetStatus.ACTIVE,
  })
  status: AssetStatus;

  @Prop({ trim: true, default: '' })
  location: string;

  @Prop({ trim: true, default: '' })
  assignedTo: string;

  @Prop({ type: WarrantySchema })
  warranty: Warranty;

  @Prop({ default: 5, min: 1 })
  usefulLifeYears: number;

  @Prop({ default: 0, min: 0 })
  salvageValue: number;

  @Prop({
    enum: Object.values(DepreciationMethod),
    default: DepreciationMethod.STRAIGHT_LINE,
  })
  depreciationMethod: DepreciationMethod;

  @Prop({ type: [MaintenanceLogSchema], default: [] })
  maintenanceHistory: MaintenanceLog[];

  @Prop({ type: Date })
  nextServiceDate: Date;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const FixedAssetSchema = SchemaFactory.createForClass(FixedAsset);

// Indexes
FixedAssetSchema.index({ storeId: 1, isDeleted: 1 });
FixedAssetSchema.index({ storeId: 1, category: 1 });
FixedAssetSchema.index({ storeId: 1, status: 1 });
FixedAssetSchema.index({ storeId: 1, assetTag: 1 }, { unique: true });
FixedAssetSchema.index({ storeId: 1, nextServiceDate: 1 });
