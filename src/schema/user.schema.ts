import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { MembershipStatus } from '../enums/membership.enum';

@Schema({ timestamps: true, versionKey: false })
export class User extends Document {
  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  mobile?: string;

  @Prop([String])
  skills: string[];

  @Prop({ type: Object })
  socialLinks: {
    linkedin?: string;
    twitter?: string;
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    github?: string;
    website?: string;
  };

  @Prop()
  location: string;

  @Prop({ default: 'en' })
  preferredLanguage: string;

  @Prop()
  lastActive: Date;

  @Prop()
  bio?: string;

  @Prop()
  image?: string;

  @Prop()
  imageS3Key?: string; // S3 key for deletion when replacing image

  @Prop({ default: true })
  visibleToCommunity: boolean;

  @Prop({ default: 'user' })
  role: string;

  @Prop()
  hashKey?: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop()
  emailVerificationToken?: string;

  @Prop()
  emailVerificationExpires?: Date;

  @Prop()
  resetPasswordToken?: string;

  @Prop()
  resetPasswordExpires?: Date;

  // Membership fields for annual subscription
  @Prop({
    type: String,
    enum: Object.values(MembershipStatus),
    default: MembershipStatus.NONE,
  })
  membershipStatus: MembershipStatus;

  @Prop()
  membershipEndDate?: Date;

  @Prop({ default: 0, min: 0 })
  membershipPrice?: number;

  @Prop({ default: 0, min: 0 })
  specialistSessionsAttended?: number;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

// 👉 Add this right here
export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);
