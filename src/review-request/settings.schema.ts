import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ReviewRequestTrigger, ReviewRequestChannel } from './enum';

@Schema({ timestamps: true, versionKey: false, collection: 'review_request_settings' })
export class ReviewRequestSettings extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, unique: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  // Enable/disable
  @Prop({ default: false })
  enabled: boolean;

  // Trigger settings
  @Prop({ type: String, enum: Object.values(ReviewRequestTrigger), default: ReviewRequestTrigger.DELIVERED })
  triggerOn: ReviewRequestTrigger;

  @Prop({ default: 24 })
  delayHours: number; // Hours after trigger before sending

  @Prop({ default: 14 })
  linkExpirationDays: number;

  // Channel settings
  @Prop({ type: String, enum: Object.values(ReviewRequestChannel), default: ReviewRequestChannel.SMS })
  channel: ReviewRequestChannel;

  // Reminder settings
  @Prop({ default: true })
  sendReminders: boolean;

  @Prop({ default: 3 })
  reminderDelayDays: number; // Days after first message

  @Prop({ default: 2 })
  maxReminders: number;

  // SMS Templates
  @Prop({
    default: 'Hi {customer_name}! Thank you for your order #{order_number}. We\'d love to hear your feedback! Click here to leave a review: {review_link}',
  })
  smsTemplate: string;

  @Prop({
    default: 'Hi {customer_name}! Just a reminder - we\'d still love to hear your thoughts on your recent order #{order_number}. {review_link}',
  })
  reminderTemplate: string;

  // Filtering
  @Prop()
  excludeOrdersBelow?: number; // Minimum order value

  @Prop({ default: false })
  onlyVerifiedCustomers: boolean;

  // Auto-approval settings
  @Prop({ default: false })
  autoApproveReviews: boolean;

  @Prop({ default: 4 })
  autoApproveMinRating: number; // Minimum rating for auto-approve

  @Prop({ default: false })
  autoPublishApproved: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type ReviewRequestSettingsDocument = ReviewRequestSettings & Document;

export const ReviewRequestSettingsSchema = SchemaFactory.createForClass(ReviewRequestSettings);
