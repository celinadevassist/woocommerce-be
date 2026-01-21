import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum AuditAction {
  // Member actions
  MEMBER_INVITED = 'member.invited',
  MEMBER_JOINED = 'member.joined',
  MEMBER_ROLE_UPDATED = 'member.role_updated',
  MEMBER_REMOVED = 'member.removed',
  MEMBER_LEFT = 'member.left',

  // Invitation actions
  INVITATION_SENT = 'invitation.sent',
  INVITATION_ACCEPTED = 'invitation.accepted',
  INVITATION_REVOKED = 'invitation.revoked',
  INVITATION_EXPIRED = 'invitation.expired',
  INVITATION_RESENT = 'invitation.resent',

  // Store actions
  STORE_CONNECTED = 'store.connected',
  STORE_UPDATED = 'store.updated',
  STORE_DISCONNECTED = 'store.disconnected',
  STORE_SYNCED = 'store.synced',

  // Product actions
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_DELETED = 'product.deleted',
  PRODUCT_SYNCED = 'product.synced',

  // Order actions
  ORDER_SYNCED = 'order.synced',
  ORDER_STATUS_UPDATED = 'order.status_updated',

  // Customer actions
  CUSTOMER_SYNCED = 'customer.synced',

  // Category actions
  CATEGORY_CREATED = 'category.created',
  CATEGORY_UPDATED = 'category.updated',
  CATEGORY_DELETED = 'category.deleted',
  CATEGORY_SYNCED = 'category.synced',

  // Attribute actions
  ATTRIBUTE_CREATED = 'attribute.created',
  ATTRIBUTE_UPDATED = 'attribute.updated',
  ATTRIBUTE_DELETED = 'attribute.deleted',
  ATTRIBUTE_SYNCED = 'attribute.synced',

  // Tag actions
  TAG_CREATED = 'tag.created',
  TAG_UPDATED = 'tag.updated',
  TAG_DELETED = 'tag.deleted',
  TAG_SYNCED = 'tag.synced',

  // Review actions
  REVIEW_SYNCED = 'review.synced',
  REVIEW_REPLIED = 'review.replied',

  // Settings actions
  SETTINGS_UPDATED = 'settings.updated',

  // Auth actions
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  PASSWORD_CHANGED = 'password.changed',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

@Schema({ timestamps: true, versionKey: false, collection: 'audit_logs' })
export class AuditLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', index: true })
  storeId?: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  userId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, enum: Object.values(AuditAction), index: true })
  action: AuditAction;

  @Prop({ required: true })
  resourceType: string; // 'store', 'product', 'order', 'member', etc.

  @Prop({ type: MongooseSchema.Types.ObjectId })
  resourceId?: MongooseSchema.Types.ObjectId;

  @Prop()
  resourceName?: string; // Human-readable name for display

  @Prop({
    type: String,
    enum: Object.values(AuditSeverity),
    default: AuditSeverity.INFO,
  })
  severity: AuditSeverity;

  @Prop({ required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>; // Additional context data

  @Prop({ type: MongooseSchema.Types.Mixed })
  previousValues?: Record<string, any>; // For tracking changes

  @Prop({ type: MongooseSchema.Types.Mixed })
  newValues?: Record<string, any>; // For tracking changes

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: () => new Date(), index: true })
  createdAt: Date;
}

export type AuditLogDocument = AuditLog & Document;

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Compound indexes for efficient querying
AuditLogSchema.index({ storeId: 1, createdAt: -1 });
AuditLogSchema.index({ storeId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1 });

// TTL index to auto-delete old logs (90 days)
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
