import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: true })
export class ReviewPhoto {
  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  s3Key?: string;

  @Prop()
  caption?: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: Date, default: Date.now })
  uploadedAt: Date;
}

export const ReviewPhotoSchema = SchemaFactory.createForClass(ReviewPhoto);
