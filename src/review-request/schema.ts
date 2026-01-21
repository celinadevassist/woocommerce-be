import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ReviewRequestStatus, ReviewRequestChannel } from './enum';

// Sub-schema for items to review
@Schema({ _id: false })
export class ReviewRequestItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  productId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop()
  productSku?: string;

  @Prop()
  productImage?: string;

  @Prop({ default: 1 })
  quantity: number;

  @Prop({ default: false })
  reviewed: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Review' })
  reviewId?: MongooseSchema.Types.ObjectId;
}

export const ReviewRequestItemSchema =
  SchemaFactory.createForClass(ReviewRequestItem);

@Schema({ timestamps: true, versionKey: false, collection: 'review_requests' })
export class ReviewRequest extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  })
  orderId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  orderNumber: string;

  // Customer info
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer' })
  customerId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  customerName: string;

  @Prop({ required: true, index: true })
  customerPhone: string;

  @Prop()
  customerEmail?: string;

  // Items to review
  @Prop({ type: [ReviewRequestItemSchema], default: [] })
  items: ReviewRequestItem[];

  // Token for public access
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true })
  tokenExpiresAt: Date;

  // Status
  @Prop({
    type: String,
    enum: Object.values(ReviewRequestStatus),
    default: ReviewRequestStatus.PENDING,
    index: true,
  })
  status: ReviewRequestStatus;

  // Tracking
  @Prop()
  scheduledFor: Date;

  @Prop()
  sentAt?: Date;

  @Prop({ type: String, enum: Object.values(ReviewRequestChannel) })
  sentVia?: ReviewRequestChannel;

  @Prop()
  messageId?: string;

  @Prop()
  openedAt?: Date;

  @Prop()
  submittedAt?: Date;

  @Prop({ default: 0 })
  remindersSent: number;

  @Prop()
  lastReminderAt?: Date;

  // Configuration
  @Prop({ default: 24 })
  delayHours: number;

  @Prop({ default: 14 })
  expirationDays: number;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type ReviewRequestDocument = ReviewRequest & Document;

export const ReviewRequestSchema = SchemaFactory.createForClass(ReviewRequest);

// Indexes
ReviewRequestSchema.index({ storeId: 1, status: 1 });
ReviewRequestSchema.index({ storeId: 1, createdAt: -1 });
ReviewRequestSchema.index({ token: 1 }, { unique: true });
ReviewRequestSchema.index({ scheduledFor: 1, status: 1 }); // For scheduled job queries
ReviewRequestSchema.index({ orderId: 1 }, { unique: true }); // One request per order
ReviewRequestSchema.index({ customerPhone: 1 });
ReviewRequestSchema.index({ tokenExpiresAt: 1 }); // For expiration queries
