import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { SyncJobType, SyncJobStatus, SyncEntityType, SyncMode } from './enum';

@Schema({ timestamps: true, versionKey: false, collection: 'sync_jobs' })
export class SyncJob extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(SyncEntityType), required: true })
  entityType: SyncEntityType;

  @Prop({ type: String, enum: Object.values(SyncJobType), required: true })
  type: SyncJobType;

  @Prop({
    type: String,
    enum: Object.values(SyncJobStatus),
    default: SyncJobStatus.PENDING,
  })
  status: SyncJobStatus;

  @Prop({ type: String, enum: Object.values(SyncMode), default: SyncMode.FULL })
  syncMode: SyncMode;

  @Prop()
  modifiedAfter?: Date; // For delta sync - only fetch records modified after this date

  @Prop({ default: 0 })
  totalItems: number;

  @Prop({ default: 0 })
  processedItems: number;

  @Prop({ default: 0 })
  createdItems: number;

  @Prop({ default: 0 })
  updatedItems: number;

  @Prop({ default: 0 })
  skippedItems: number;

  @Prop({ default: 0 })
  failedItems: number;

  @Prop({ default: 1 })
  currentPage: number;

  @Prop({ default: 1 })
  totalPages: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  pausedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  error?: string;

  @Prop({ type: [String], default: [] })
  syncErrors: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  triggeredBy?: MongooseSchema.Types.ObjectId;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type SyncJobDocument = SyncJob & Document;

export const SyncJobSchema = SchemaFactory.createForClass(SyncJob);

// Indexes
SyncJobSchema.index({ storeId: 1, status: 1 });
SyncJobSchema.index({ storeId: 1, createdAt: -1 });
SyncJobSchema.index({ status: 1, entityType: 1 });
