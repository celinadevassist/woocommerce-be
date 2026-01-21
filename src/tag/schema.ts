import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, versionKey: false, collection: 'tags' })
export class Tag extends Document {
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

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 0 })
  count: number; // Number of products with this tag

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

export type TagDocument = Tag & Document;

export const TagSchema = SchemaFactory.createForClass(Tag);

// Indexes
TagSchema.index({ storeId: 1, externalId: 1 }, { unique: true });
TagSchema.index({ storeId: 1, slug: 1 });
TagSchema.index({ pendingSync: 1 });
