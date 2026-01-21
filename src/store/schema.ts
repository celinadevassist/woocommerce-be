import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
  StorePlatform,
  StoreStatus,
  SyncStatus,
  StoreMemberRole,
} from './enum';

// Sub-schema for sync status per entity type
@Schema({ _id: false })
export class SyncStatusDetail {
  @Prop()
  lastSync?: Date;

  @Prop({
    type: String,
    enum: Object.values(SyncStatus),
    default: SyncStatus.IDLE,
  })
  status: SyncStatus;

  @Prop({ default: 0 })
  itemCount: number;

  @Prop()
  error?: string;
}

export const SyncStatusDetailSchema =
  SchemaFactory.createForClass(SyncStatusDetail);

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

  // Optional WordPress credentials for media management (REST API)
  // These are needed to delete images from WordPress Media Library
  @Prop()
  wpUsername?: string;

  @Prop()
  wpAppPassword?: string;
}

export const StoreCredentialsSchema =
  SchemaFactory.createForClass(StoreCredentials);

// Sub-schema for store members
@Schema({ _id: false })
export class StoreMember {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(StoreMemberRole), required: true })
  role: StoreMemberRole;

  @Prop({ default: () => new Date() })
  joinedAt: Date;
}

export const StoreMemberSchema = SchemaFactory.createForClass(StoreMember);

@Schema({ timestamps: true, versionKey: false, collection: 'stores' })
export class Store extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  ownerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [StoreMemberSchema], default: [] })
  members: StoreMember[];

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    enum: Object.values(StorePlatform),
    default: StorePlatform.WOOCOMMERCE,
  })
  platform: StorePlatform;

  @Prop({ required: true })
  url: string;

  @Prop({ type: StoreCredentialsSchema, select: false }) // Don't include credentials by default
  credentials: StoreCredentials;

  @Prop({
    type: String,
    enum: Object.values(StoreStatus),
    default: StoreStatus.CONNECTING,
  })
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

  // Public API key for external widget/API access
  @Prop({ unique: true, sparse: true })
  publicApiKey?: string;

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
StoreSchema.index({ ownerId: 1, isDeleted: 1 });
StoreSchema.index({ 'members.userId': 1 });
StoreSchema.index({ status: 1 });
StoreSchema.index({ platform: 1 });
StoreSchema.index({ createdAt: -1 });
StoreSchema.index({ url: 1 }, { unique: true }); // Prevent duplicate stores
StoreSchema.index({ publicApiKey: 1 }); // For public API lookups
