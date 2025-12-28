import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Schema({ timestamps: true, versionKey: false, collection: 'invitations' })
export class Invitation extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true })
  role: string; // admin, manager, staff, viewer

  @Prop({ type: MongooseSchema.Types.Mixed, default: 'all' })
  storeAccess: string[] | 'all';

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  invitedBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  acceptedBy?: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(InvitationStatus),
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  acceptedAt?: Date;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type InvitationDocument = Invitation & Document;

export const InvitationSchema = SchemaFactory.createForClass(Invitation);

// Indexes
InvitationSchema.index({ organizationId: 1, email: 1 });
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
InvitationSchema.index({ status: 1 });
