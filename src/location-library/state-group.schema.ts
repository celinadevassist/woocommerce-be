import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type StateGroupDocument = StateGroup & Document;

@Schema({ timestamps: true })
export class StateGroup {
  @ApiProperty({ description: 'Group name', example: 'Greater Cairo' })
  @Prop({ required: true })
  name: string;

  @ApiProperty({ description: 'Country code (ISO 2-letter)', example: 'EG' })
  @Prop({ required: true, uppercase: true })
  countryCode: string;

  @ApiProperty({ description: 'Color for visual distinction', example: '#3B82F6' })
  @Prop({ default: '#6B7280' })
  color: string;

  @ApiProperty({ description: 'Description of the group' })
  @Prop()
  description: string;

  @ApiProperty({ description: 'Owner user ID' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @ApiProperty({ description: 'Display order' })
  @Prop({ default: 0 })
  order: number;
}

export const StateGroupSchema = SchemaFactory.createForClass(StateGroup);

// Indexes
StateGroupSchema.index({ ownerId: 1, countryCode: 1 });
StateGroupSchema.index({ ownerId: 1, name: 1 }, { unique: true });
