import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ==================== ATTRIBUTE TERM ====================

@Schema({ timestamps: true })
export class AttributeTerm {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Attribute' })
  attributeId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Store' })
  storeId: Types.ObjectId;

  @Prop({ required: true })
  wooId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 0 })
  menuOrder: number;

  @Prop({ default: 0 })
  count: number;

  @Prop({ default: false })
  isDeleted: boolean;
}

export type AttributeTermDocument = AttributeTerm & Document;
export const AttributeTermSchema = SchemaFactory.createForClass(AttributeTerm);

// Indexes for AttributeTerm
AttributeTermSchema.index({ attributeId: 1, storeId: 1 });
AttributeTermSchema.index({ storeId: 1, wooId: 1 }, { unique: true });

// ==================== ATTRIBUTE ====================

@Schema({ timestamps: true })
export class Attribute {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Store' })
  storeId: Types.ObjectId;

  @Prop({ required: true })
  wooId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ default: 'select' })
  type: string;

  @Prop({ default: 'menu_order' })
  orderBy: string;

  @Prop({ default: false })
  hasArchives: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}

export type AttributeDocument = Attribute & Document;
export const AttributeSchema = SchemaFactory.createForClass(Attribute);

// Indexes for Attribute
AttributeSchema.index({ storeId: 1 });
AttributeSchema.index({ storeId: 1, wooId: 1 }, { unique: true });
