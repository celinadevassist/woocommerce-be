import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { StockStatus } from './enum';
import { ProductImage, ProductImageSchema, ProductDimensions, ProductDimensionsSchema } from './schema';

// Sub-schema for variation attributes
@Schema({ _id: false })
export class VariationAttribute {
  @Prop()
  externalId?: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  option: string;
}

export const VariationAttributeSchema = SchemaFactory.createForClass(VariationAttribute);

@Schema({ timestamps: true, versionKey: false, collection: 'product_variants' })
export class ProductVariant extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, index: true })
  externalId: number;

  @Prop({ required: true })
  parentExternalId: number;

  @Prop({ index: true })
  sku?: string;

  @Prop()
  permalink?: string;

  @Prop()
  description?: string;

  @Prop()
  price?: string;

  @Prop()
  regularPrice?: string;

  @Prop()
  salePrice?: string;

  @Prop({ default: false })
  onSale: boolean;

  @Prop({ default: 'publish' })
  status: string;

  @Prop({ default: true })
  purchasable: boolean;

  @Prop({ default: false })
  virtual: boolean;

  @Prop({ default: false })
  downloadable: boolean;

  @Prop({ default: false })
  manageStock: boolean;

  @Prop({ default: null })
  stockQuantity: number | null;

  @Prop({ type: String, enum: Object.values(StockStatus), default: StockStatus.IN_STOCK })
  stockStatus: StockStatus;

  @Prop()
  weight?: string;

  @Prop({ type: ProductDimensionsSchema })
  dimensions?: ProductDimensions;

  @Prop({ type: ProductImageSchema })
  image?: ProductImage;

  @Prop({ type: [VariationAttributeSchema], default: [] })
  attributes: VariationAttribute[];

  @Prop()
  dateCreatedWoo?: Date;

  @Prop()
  dateModifiedWoo?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ default: false })
  pendingSync: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type ProductVariantDocument = ProductVariant & Document;

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

// Indexes
ProductVariantSchema.index({ storeId: 1, externalId: 1 }, { unique: true });
ProductVariantSchema.index({ productId: 1, isDeleted: 1 });
ProductVariantSchema.index({ storeId: 1, sku: 1 });
ProductVariantSchema.index({ pendingSync: 1 });
