import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, versionKey: false, collection: 'response_templates' })
export class ResponseTemplate extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String })
  category?: string; // e.g., 'positive', 'negative', 'neutral', 'thank-you', 'apology'

  @Prop({ type: Number, default: 0 })
  usageCount: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type ResponseTemplateDocument = ResponseTemplate & Document;

export const ResponseTemplateSchema = SchemaFactory.createForClass(ResponseTemplate);

// Indexes
ResponseTemplateSchema.index({ organizationId: 1, isDeleted: 1 });
ResponseTemplateSchema.index({ organizationId: 1, category: 1 });
