import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Segment rule sub-schema
@Schema({ _id: false })
export class SegmentRule {
  @Prop({ required: true })
  field: string; // e.g., 'stats.totalSpent', 'stats.ordersCount', 'tier', 'tags'

  @Prop({ required: true })
  operator: string; // 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value: any;
}

export const SegmentRuleSchema = SchemaFactory.createForClass(SegmentRule);

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'customer_segments',
})
export class CustomerSegment extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  color: string; // For display purposes

  @Prop({ type: [SegmentRuleSchema], default: [] })
  rules: SegmentRule[];

  @Prop({ type: String, default: 'and' })
  ruleLogic: string; // 'and' or 'or'

  @Prop({ default: 0 })
  customerCount: number; // Cached count

  @Prop()
  lastCountUpdated?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type CustomerSegmentDocument = CustomerSegment & Document;

export const CustomerSegmentSchema =
  SchemaFactory.createForClass(CustomerSegment);

// Indexes
CustomerSegmentSchema.index({ storeId: 1, isDeleted: 1 });
CustomerSegmentSchema.index({ storeId: 1, name: 1 });
