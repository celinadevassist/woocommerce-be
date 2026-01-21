import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
  ReviewStatus,
  ReviewSource,
  ReviewType,
  ModerationStatus,
} from './enum';
import { ReviewPhoto, ReviewPhotoSchema } from './review-photo.schema';

@Schema({ timestamps: true, versionKey: false, collection: 'reviews' })
export class Review extends Document {
  // WooCommerce reference (optional for manual reviews)
  @Prop({ index: true })
  externalId?: number;

  // Store reference
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  // Product reference (optional for service/general reviews)
  @Prop({ index: true })
  productExternalId?: number;

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
  @Prop({
    type: String,
    enum: Object.values(ReviewStatus),
    default: ReviewStatus.APPROVED,
  })
  status: ReviewStatus;

  @Prop({
    type: String,
    enum: Object.values(ReviewSource),
    default: ReviewSource.WOOCOMMERCE,
  })
  source: ReviewSource;

  // Review type
  @Prop({
    type: String,
    enum: Object.values(ReviewType),
    default: ReviewType.PRODUCT,
  })
  reviewType: ReviewType;

  // Photos
  @Prop({ type: [ReviewPhotoSchema], default: [] })
  photos: ReviewPhoto[];

  // Moderation
  @Prop({
    type: String,
    enum: Object.values(ModerationStatus),
    default: ModerationStatus.PENDING,
  })
  moderationStatus: ModerationStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  moderatedBy?: MongooseSchema.Types.ObjectId;

  @Prop()
  moderatedAt?: Date;

  @Prop()
  rejectionReason?: string;

  // Publishing
  @Prop({ default: false })
  isPublished: boolean;

  @Prop()
  publishedAt?: Date;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop()
  featuredOrder?: number;

  // Customer info (for manual reviews)
  @Prop()
  customerEmail?: string;

  @Prop()
  customerPhone?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
  customerId?: MongooseSchema.Types.ObjectId;

  // Engagement
  @Prop({ default: 0 })
  helpfulCount: number;

  @Prop({ default: 0 })
  viewCount: number;

  // Review request reference
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ReviewRequest' })
  reviewRequestId?: MongooseSchema.Types.ObjectId;

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
ReviewSchema.index(
  { storeId: 1, externalId: 1 },
  { unique: true, sparse: true },
);
ReviewSchema.index({ storeId: 1, productExternalId: 1 });
ReviewSchema.index({ storeId: 1, status: 1 });
ReviewSchema.index({ storeId: 1, createdAt: -1 });
ReviewSchema.index({ rating: 1 });
ReviewSchema.index({ reviewerEmail: 1 });

// New indexes for moderation and publishing
ReviewSchema.index({ storeId: 1, moderationStatus: 1 });
ReviewSchema.index({ storeId: 1, isPublished: 1 });
ReviewSchema.index({ storeId: 1, reviewType: 1 });
ReviewSchema.index({ storeId: 1, source: 1 });
ReviewSchema.index({ storeId: 1, isFeatured: 1, featuredOrder: 1 });
ReviewSchema.index({ reviewRequestId: 1 });
ReviewSchema.index({ customerId: 1 });
