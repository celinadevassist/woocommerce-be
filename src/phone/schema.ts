import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum PhoneStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked', // Opted out of SMS
  INVALID = 'invalid', // Bad number
}

export enum PhoneType {
  MOBILE = 'mobile',
  LANDLINE = 'landline',
  UNKNOWN = 'unknown',
}

@Schema({ timestamps: true, versionKey: false, collection: 'phones' })
export class Phone extends Document {
  // The normalized phone number (unique per store)
  @Prop({ required: true, index: true })
  number: string; // Format: +201273215943

  // Store reference
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

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
  @Prop({ type: String, enum: Object.values(PhoneStatus), default: PhoneStatus.ACTIVE })
  status: PhoneStatus;

  @Prop({ type: String, enum: Object.values(PhoneType), default: PhoneType.MOBILE })
  type: PhoneType;

  // SMS opt-in/out
  @Prop({ default: true })
  smsOptIn: boolean;

  @Prop()
  smsOptOutAt?: Date;

  // Source tracking
  @Prop({ default: 'order' })
  source: string; // 'order', 'manual', 'import', 'woocommerce'

  @Prop()
  sourceOrderId?: string;

  // SMS stats
  @Prop({ default: 0 })
  smsSentCount: number;

  @Prop()
  lastSmsSentAt?: Date;

  @Prop({ default: 0 })
  smsFailedCount: number;

  // History of owners (for tracking transfers)
  @Prop({
    type: [{
      customerId: { type: MongooseSchema.Types.ObjectId, ref: 'Customer' },
      assignedAt: { type: Date, default: Date.now },
      removedAt: Date,
      source: String,
    }],
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

export type PhoneDocument = Phone & Document;

export const PhoneSchema = SchemaFactory.createForClass(Phone);

// Indexes
// Unique phone number per store
PhoneSchema.index({ storeId: 1, number: 1 }, { unique: true });
// Find phones by customer
PhoneSchema.index({ customerId: 1 });
// Find phones for SMS campaigns (active, opted-in, verified)
PhoneSchema.index({ storeId: 1, status: 1, smsOptIn: 1, isVerified: 1 });
// Find by organization
PhoneSchema.index({ organizationId: 1 });
