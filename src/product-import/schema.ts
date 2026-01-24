import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ImportStatus, ImportSource, PricingMode, MarkupType } from './enum';
import { IImportResult, IImportSettings, ISelectedProduct } from './interface';

export type ProductImportDocument = ProductImport & Document;

@Schema({ timestamps: true, versionKey: false, collection: 'product-imports' })
export class ProductImport {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ enum: ImportSource, required: true })
  source: ImportSource;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ enum: ImportStatus, default: ImportStatus.PENDING, index: true })
  status: ImportStatus;

  @Prop({ default: 0 })
  totalProducts: number;

  @Prop({ default: 0 })
  completedProducts: number;

  @Prop({ default: 0 })
  failedProducts: number;

  @Prop({ default: 0 })
  skippedProducts: number;

  @Prop()
  currentProduct?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop(
    raw({
      pricing: {
        mode: { type: String, enum: Object.values(PricingMode) },
        markupType: { type: String, enum: Object.values(MarkupType) },
        markupValue: { type: Number },
        fixedPrice: { type: Number },
      },
      categories: [{ type: String }],
      tags: [{ type: String }],
      status: { type: String, enum: ['publish', 'draft', 'private'] },
      catalogVisibility: { type: String, enum: ['visible', 'catalog', 'search', 'hidden'] },
      stockStatus: { type: String, enum: ['instock', 'outofstock', 'onbackorder'] },
      manageStock: { type: Boolean },
      stockQuantity: { type: Number },
      autoGenerateVariations: { type: Boolean },
      variationPriceMode: { type: String, enum: ['original', 'markup'] },
      variationMarkupType: { type: String, enum: ['percentage', 'fixed'] },
      variationMarkupValue: { type: Number },
      maxImages: { type: Number },
      attributes: [{
        name: { type: String },
        options: [{ type: String }],
        visible: { type: Boolean },
        variation: { type: Boolean },
      }],
    }),
  )
  settings: IImportSettings;

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }] })
  selectedProducts: ISelectedProduct[];

  @Prop({ type: [{ type: MongooseSchema.Types.Mixed }] })
  results: IImportResult[];

  @Prop()
  errorMessage?: string;
}

export const ProductImportSchema = SchemaFactory.createForClass(ProductImport);

// Indexes for efficient querying
ProductImportSchema.index({ storeId: 1, status: 1 });
ProductImportSchema.index({ storeId: 1, createdAt: -1 });
ProductImportSchema.index({ userId: 1, createdAt: -1 });
