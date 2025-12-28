import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { OrganizationMemberRole } from './enum';

// Sub-schema for organization members
@Schema({ _id: false })
export class OrganizationMember {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(OrganizationMemberRole),
    default: OrganizationMemberRole.VIEWER,
  })
  role: OrganizationMemberRole;

  @Prop({ type: MongooseSchema.Types.Mixed, default: 'all' })
  storeAccess: string[] | 'all'; // Array of store IDs or 'all'

  @Prop({ default: () => new Date() })
  invitedAt: Date;

  @Prop()
  acceptedAt?: Date;
}

export const OrganizationMemberSchema = SchemaFactory.createForClass(OrganizationMember);

@Schema({ timestamps: true, versionKey: false, collection: 'organizations' })
export class Organization extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [OrganizationMemberSchema], default: [] })
  members: OrganizationMember[];

  @Prop()
  billingEmail?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export type OrganizationDocument = Organization & Document;

export const OrganizationSchema = SchemaFactory.createForClass(Organization);

// Indexes
OrganizationSchema.index({ ownerId: 1, isDeleted: 1 });
OrganizationSchema.index({ 'members.userId': 1 });
OrganizationSchema.index({ createdAt: -1 });
