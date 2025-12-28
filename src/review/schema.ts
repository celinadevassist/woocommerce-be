import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ReviewStatus, ReviewSource } from './enum';

@Schema({ timestamps: true, versionKey: false, collection: 'reviews' })
export class Review extends Document {
  // WooCommerce reference
  @Prop({ required: true, index: true })
  externalId: number;

  // Multi-tenant references
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  // Product reference
  @Prop({ required: true, index: true })
  productExternalId: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', index: true })
  localProductId?: MongooseSchema.Types.ObjectId;

  // Reviewer info
  @Prop({ required: true })
  reviewer: string;

  @Prop({ required: true, index: true })
  reviewerEmail: string;

  @Prop()
  reviewerAvatarUrl?: string;

  // Review content
  @Prop({ required: true })
  review: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ default: false })
  verified: boolean;

  // Status
  @Prop({ type: String, enum: Object.values(ReviewStatus), default: ReviewStatus.APPROVED })
  status: ReviewStatus;

  @Prop({ type: String, enum: Object.values(ReviewSource), default: ReviewSource.WOOCOMMERCE })
  source: ReviewSource;

  // Internal fields
  @Prop()
  reply?: string;

  @Prop()
  repliedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  repliedBy?: MongooseSchema.Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  internalNotes?: string;

  // Flags
  @Prop({ default: false })
  isFlagged: boolean;

  @Prop()
  flagReason?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  // WooCommerce dates
  @Prop()
  wooCreatedAt?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type ReviewDocument = Review & Document;

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Indexes
ReviewSchema.index({ storeId: 1, externalId: 1 }, { unique: true });
ReviewSchema.index({ storeId: 1, productExternalId: 1 });
ReviewSchema.index({ storeId: 1, status: 1 });
ReviewSchema.index({ organizationId: 1, createdAt: -1 });
ReviewSchema.index({ rating: 1 });
ReviewSchema.index({ reviewerEmail: 1 });
