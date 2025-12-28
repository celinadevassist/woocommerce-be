import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { StorePlatform, StoreStatus, SyncStatus } from './enum';

// Sub-schema for sync status per entity type
@Schema({ _id: false })
export class SyncStatusDetail {
  @Prop()
  lastSync?: Date;

  @Prop({ type: String, enum: Object.values(SyncStatus), default: SyncStatus.IDLE })
  status: SyncStatus;

  @Prop({ default: 0 })
  itemCount: number;

  @Prop()
  error?: string;
}

export const SyncStatusDetailSchema = SchemaFactory.createForClass(SyncStatusDetail);

// Sub-schema for store settings
@Schema({ _id: false })
export class StoreSettings {
  @Prop({ default: true })
  autoSync: boolean;

  @Prop({ default: 15 })
  syncInterval: number; // minutes

  @Prop({ default: 10 })
  lowStockThreshold: number;

  @Prop()
  timezone?: string;

  @Prop()
  currency?: string;

  @Prop()
  storeAddress?: string;

  @Prop()
  storePhone?: string;

  @Prop()
  storeEmail?: string;
}

export const StoreSettingsSchema = SchemaFactory.createForClass(StoreSettings);

// Sub-schema for credentials (encrypted)
@Schema({ _id: false })
export class StoreCredentials {
  @Prop({ required: true })
  consumerKey: string;

  @Prop({ required: true })
  consumerSecret: string;
}

export const StoreCredentialsSchema = SchemaFactory.createForClass(StoreCredentials);

@Schema({ timestamps: true, versionKey: false, collection: 'stores' })
export class Store extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: Object.values(StorePlatform), default: StorePlatform.WOOCOMMERCE })
  platform: StorePlatform;

  @Prop({ required: true })
  url: string;

  @Prop({ type: StoreCredentialsSchema, select: false }) // Don't include credentials by default
  credentials: StoreCredentials;

  @Prop({ type: String, enum: Object.values(StoreStatus), default: StoreStatus.CONNECTING })
  status: StoreStatus;

  @Prop()
  lastSyncAt?: Date;

  @Prop({
    type: {
      products: { type: SyncStatusDetailSchema, default: {} },
      orders: { type: SyncStatusDetailSchema, default: {} },
      customers: { type: SyncStatusDetailSchema, default: {} },
      reviews: { type: SyncStatusDetailSchema, default: {} },
    },
    default: {},
  })
  syncStatus: {
    products?: SyncStatusDetail;
    orders?: SyncStatusDetail;
    customers?: SyncStatusDetail;
    reviews?: SyncStatusDetail;
  };

  @Prop({ type: StoreSettingsSchema, default: {} })
  settings: StoreSettings;

  @Prop()
  webhookSecret?: string;

  @Prop()
  lastError?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type StoreDocument = Store & Document;

export const StoreSchema = SchemaFactory.createForClass(Store);

// Indexes
StoreSchema.index({ organizationId: 1, isDeleted: 1 });
StoreSchema.index({ status: 1 });
StoreSchema.index({ platform: 1 });
StoreSchema.index({ createdAt: -1 });
StoreSchema.index({ url: 1, organizationId: 1 }, { unique: true }); // Prevent duplicate stores
