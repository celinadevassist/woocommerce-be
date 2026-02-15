import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
  FieldType,
  FieldsetStatus,
  AssignmentType,
  PriceModifierType,
  FieldsetScope,
} from './enum';

const ObjectId = MongooseSchema.Types.ObjectId;

// Sub-schema for option (dropdown, radio, image swatch)
@Schema({ _id: false })
export class SwatchOption {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  value: string;

  @Prop()
  image?: string;

  @Prop({ type: String, enum: Object.values(PriceModifierType), default: PriceModifierType.NONE })
  priceType?: PriceModifierType;

  @Prop({ default: 0 })
  priceAmount?: number;
}

export const SwatchOptionSchema = SchemaFactory.createForClass(SwatchOption);

// Sub-schema for conditional logic
@Schema({ _id: false })
export class FieldCondition {
  @Prop({ required: true })
  fieldName: string;

  @Prop({ required: true })
  operator: string; // equals, not_equals, contains, is_empty, is_not_empty

  @Prop({ default: '' })
  value: string;
}

export const FieldConditionSchema = SchemaFactory.createForClass(FieldCondition);

// Sub-schema for a custom field
@Schema({ _id: false })
export class CustomField {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  label: string;

  @Prop({
    type: String,
    enum: Object.values(FieldType),
    required: true,
  })
  type: FieldType;

  @Prop({ default: false })
  required: boolean;

  @Prop()
  placeholder?: string;

  @Prop()
  min?: number;

  @Prop()
  max?: number;

  @Prop()
  checkboxLabel?: string;

  // Price add-on for the field itself (text, textarea, number, checkbox, color, date, file)
  @Prop({ type: String, enum: Object.values(PriceModifierType), default: PriceModifierType.NONE })
  priceType?: PriceModifierType;

  @Prop({ default: 0 })
  priceAmount?: number;

  // Conditional logic
  @Prop({ type: [FieldConditionSchema], default: [] })
  conditions: FieldCondition[];

  // Color picker
  @Prop()
  defaultColor?: string;

  // Date picker
  @Prop()
  minDate?: string;

  @Prop()
  maxDate?: string;

  // File upload
  @Prop()
  allowedFileTypes?: string; // e.g. "jpg,png,pdf"

  @Prop()
  maxFileSize?: number; // in MB

  // Demo image & note
  @Prop()
  demoImage?: string;

  @Prop()
  demoNote?: string;

  @Prop({ type: [SwatchOptionSchema], default: [] })
  options: SwatchOption[];

  @Prop({ default: 0 })
  position: number;
}

export const CustomFieldSchema = SchemaFactory.createForClass(CustomField);

// Main schema for a custom fieldset
@Schema({ timestamps: true, versionKey: false, collection: 'custom_fieldsets' })
export class CustomFieldset extends Document {
  @Prop({ type: ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({
    type: String,
    enum: Object.values(FieldsetStatus),
    default: FieldsetStatus.ACTIVE,
  })
  status: FieldsetStatus;

  @Prop({
    type: String,
    enum: Object.values(FieldsetScope),
    default: FieldsetScope.PRODUCT,
  })
  scope: FieldsetScope;

  @Prop({
    type: String,
    enum: Object.values(AssignmentType),
    required: true,
  })
  assignmentType: AssignmentType;

  @Prop({ type: [ObjectId], ref: 'Product', default: [] })
  productIds: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [ObjectId], ref: 'Category', default: [] })
  categoryIds: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [ObjectId], ref: 'Tag', default: [] })
  tagIds: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  productTypes: string[];

  @Prop({ type: [ObjectId], ref: 'Attribute', default: [] })
  attributeIds: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [CustomFieldSchema], default: [] })
  fields: CustomField[];

  @Prop({ default: 0 })
  position: number;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export const CustomFieldsetSchema =
  SchemaFactory.createForClass(CustomFieldset);

// Indexes
CustomFieldsetSchema.index({ storeId: 1, isDeleted: 1 });
CustomFieldsetSchema.index({ storeId: 1, status: 1 });
