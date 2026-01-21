import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, versionKey: false, collection: 'categories' })
export class Category extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, index: true })
  externalId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Category', default: null })
  parentId: MongooseSchema.Types.ObjectId | null;

  @Prop({ default: null })
  parentExternalId: number | null;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  display: string; // 'default', 'products', 'subcategories', 'both'

  @Prop({
    type: {
      id: { type: Number },
      src: { type: String },
      name: { type: String },
      alt: { type: String },
    },
    default: null,
  })
  image: {
    id: number;
    src: string;
    name: string;
    alt: string;
  } | null;

  @Prop({ default: 0 })
  menuOrder: number;

  @Prop({ default: 0 })
  count: number; // Number of products in this category

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

export type CategoryDocument = Category & Document;

export const CategorySchema = SchemaFactory.createForClass(Category);

// Indexes
CategorySchema.index({ storeId: 1, externalId: 1 }, { unique: true });
CategorySchema.index({ storeId: 1, slug: 1 });
CategorySchema.index({ parentId: 1 });
CategorySchema.index({ pendingSync: 1 });
