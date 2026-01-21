import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum EmailStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked', // Opted out of marketing
  INVALID = 'invalid', // Bounced/invalid email
  UNSUBSCRIBED = 'unsubscribed', // Unsubscribed from all emails
}

@Schema({ timestamps: true, versionKey: false, collection: 'emails' })
export class Email extends Document {
  // The normalized email address (lowercase, trimmed, unique per store)
  @Prop({ required: true, index: true })
  email: string;

  // Store reference
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  // Current owner
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', index: true })
  customerId?: MongooseSchema.Types.ObjectId;

  // Verification
  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  verifiedBy?: string; // User ID or 'system'

  // Status
  @Prop({
    type: String,
    enum: Object.values(EmailStatus),
    default: EmailStatus.ACTIVE,
  })
  status: EmailStatus;

  // Marketing opt-in/out
  @Prop({ default: true })
  marketingOptIn: boolean;

  @Prop()
  marketingOptOutAt?: Date;

  // Transactional emails (order confirmations, etc.) - usually always allowed
  @Prop({ default: true })
  transactionalOptIn: boolean;

  // Source tracking
  @Prop({ default: 'order' })
  source: string; // 'order', 'manual', 'import', 'woocommerce', 'signup'

  @Prop()
  sourceOrderId?: string;

  // Email stats
  @Prop({ default: 0 })
  emailsSentCount: number;

  @Prop()
  lastEmailSentAt?: Date;

  @Prop({ default: 0 })
  emailsFailedCount: number;

  @Prop({ default: 0 })
  emailsOpenedCount: number;

  @Prop({ default: 0 })
  emailsClickedCount: number;

  // Bounce tracking
  @Prop({ default: 0 })
  bounceCount: number;

  @Prop()
  lastBounceAt?: Date;

  @Prop()
  bounceReason?: string;

  // History of owners (for tracking transfers)
  @Prop({
    type: [
      {
        customerId: { type: MongooseSchema.Types.ObjectId, ref: 'Customer' },
        assignedAt: { type: Date, default: Date.now },
        removedAt: Date,
        source: String,
      },
    ],
    default: [],
  })
  ownerHistory: {
    customerId: MongooseSchema.Types.ObjectId;
    assignedAt: Date;
    removedAt?: Date;
    source?: string;
  }[];

  // Notes
  @Prop()
  notes?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type EmailDocument = Email & Document;

export const EmailSchema = SchemaFactory.createForClass(Email);

// Indexes
// Unique email per store
EmailSchema.index({ storeId: 1, email: 1 }, { unique: true });
// Find emails by customer
EmailSchema.index({ customerId: 1 });
// Find emails for marketing campaigns (active, opted-in, verified)
EmailSchema.index({ storeId: 1, status: 1, marketingOptIn: 1, isVerified: 1 });
