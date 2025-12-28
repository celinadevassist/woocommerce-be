import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { ModuleType } from './enum';

/**
 * Main Metadata Schema
 */

@Schema({ timestamps: true, versionKey: false, collection: 'metadata' })
export class Metadata {
  @ApiProperty({
    description: 'ID of the user this metadata belongs to',
    example: '60d21b4667d0d8992e610c85'
  })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true
  })
  userId: MongooseSchema.Types.ObjectId;

  @ApiProperty({
    description: 'Module this metadata is for',
    enum: ModuleType,
    example: ModuleType.EMAIL_MARKETING
  })
  @Prop({
    type: String,
    enum: Object.values(ModuleType),
    required: true
  })
  forModule: ModuleType;

  @ApiProperty({
    description: 'Metadata object containing flexible key-value pairs',
    example: { 
      erpnext: {
          baseUrl: "https://erpnext-marketing.sys-track-overview.site",
          token: "de668493e4344b0:38d508b26d63eba",
          communication_doctype: "User",
          communication_name: "Administrator",
          default_sender: "support@2zpoint.com",
          test_email: "test@example.com"
    },
    type: 'object'
  }})
  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
    default: {}
  })
  meta: Record<string, any>;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2023-01-01T00:00:00.000Z',
  })
  @Prop()
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2023-01-02T00:00:00.000Z',
  })
  @Prop()
  updatedAt: Date;
}

export type MetadataDocument = Metadata & Document;

export const MetadataSchema = SchemaFactory.createForClass(Metadata);

// 🔍 Add indexes for better query performance
MetadataSchema.index({ userId: 1 });
MetadataSchema.index({ forModule: 1 });
MetadataSchema.index({ userId: 1, forModule: 1 }, { unique: true });
MetadataSchema.index({ createdAt: -1 });
MetadataSchema.index({ updatedAt: -1 }); 