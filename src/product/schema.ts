import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ProductType, ProductStatus, StockStatus, CatalogVisibility } from './enum';

// Sub-schema for product images
@Schema({ _id: false })
export class ProductImage {
  @Prop()
  externalId?: number;

  @Prop({ required: true })
  src: string;

  @Prop()
  name?: string;

  @Prop()
  alt?: string;

  @Prop({ default: 0 })
  position: number;
}

export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

// Sub-schema for product categories
@Schema({ _id: false })
export class ProductCategory {
  @Prop()
  externalId: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  slug?: string;
}

export const ProductCategorySchema = SchemaFactory.createForClass(ProductCategory);

// Sub-schema for product tags
@Schema({ _id: false })
export class ProductTag {
  @Prop()
  externalId: number;

  @Prop({ required: true })
  name: string;

  @Prop()
  slug?: string;
}

export const ProductTagSchema = SchemaFactory.createForClass(ProductTag);

// Sub-schema for product attributes
@Schema({ _id: false })
export class ProductAttribute {
  @Prop()
  externalId?: number;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 0 })
  position: number;

  @Prop({ default: true })
  visible: boolean;

  @Prop({ default: false })
  variation: boolean;

  @Prop({ type: [String], default: [] })
  options: string[];
}

export const ProductAttributeSchema = SchemaFactory.createForClass(ProductAttribute);

// Sub-schema for product dimensions
@Schema({ _id: false })
export class ProductDimensions {
  @Prop()
  length?: string;

  @Prop()
  width?: string;

  @Prop()
  height?: string;
}

export const ProductDimensionsSchema = SchemaFactory.createForClass(ProductDimensions);

@Schema({ timestamps: true, versionKey: false, collection: 'products' })
export class Product extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, index: true })
  externalId: number;

  @Prop({ index: true })
  sku?: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  slug?: string;

  @Prop()
  permalink?: string;

  @Prop({ type: String, enum: Object.values(ProductType), default: ProductType.SIMPLE })
  type: ProductType;

  @Prop({ type: String, enum: Object.values(ProductStatus), default: ProductStatus.PUBLISH })
  status: ProductStatus;

  @Prop({ default: false })
  featured: boolean;

  @Prop({ type: String, enum: Object.values(CatalogVisibility), default: CatalogVisibility.VISIBLE })
  catalogVisibility: CatalogVisibility;

  @Prop()
  description?: string;

  @Prop()
  shortDescription?: string;

  @Prop()
  price?: string;

  @Prop()
  regularPrice?: string;

  @Prop()
  salePrice?: string;

  @Prop({ default: false })
  onSale: boolean;

  @Prop({ default: true })
  purchasable: boolean;

  @Prop({ default: 0 })
  totalSales: number;

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
  lowStockAmount?: number;

  @Prop()
  weight?: string;

  @Prop({ type: ProductDimensionsSchema })
  dimensions?: ProductDimensions;

  @Prop({ type: [ProductCategorySchema], default: [] })
  categories: ProductCategory[];

  @Prop({ type: [ProductTagSchema], default: [] })
  tags: ProductTag[];

  @Prop({ type: [ProductImageSchema], default: [] })
  images: ProductImage[];

  @Prop({ type: [ProductAttributeSchema], default: [] })
  attributes: ProductAttribute[];

  @Prop({ type: [Number], default: [] })
  variationIds: number[];

  @Prop({ default: 0 })
  variationCount: number;

  @Prop()
  parentId?: number;

  @Prop()
  dateCreatedWoo?: Date;

  @Prop()
  dateModifiedWoo?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ default: false })
  pendingSync: boolean;

  // Rating fields (synced from reviews)
  @Prop({ type: Number, default: 0 })
  averageRating: number;

  @Prop({ type: Number, default: 0 })
  ratingCount: number;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type ProductDocument = Product & Document;

export const ProductSchema = SchemaFactory.createForClass(Product);

// Indexes
ProductSchema.index({ storeId: 1, externalId: 1 }, { unique: true });
ProductSchema.index({ storeId: 1, sku: 1 });
ProductSchema.index({ organizationId: 1, isDeleted: 1 });
ProductSchema.index({ name: 'text', sku: 'text', description: 'text' });
ProductSchema.index({ status: 1, stockStatus: 1 });
ProductSchema.index({ pendingSync: 1 });
ProductSchema.index({ createdAt: -1 });
