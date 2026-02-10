import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type LocalStateDocument = LocalState & Document;

@Schema({ timestamps: true })
export class LocalState {
  @ApiProperty({ description: 'Country code (ISO 2-letter)', example: 'EG' })
  @Prop({ required: true, uppercase: true })
  countryCode: string;

  @ApiProperty({
    description: 'State code (WooCommerce format)',
    example: 'EGALX',
  })
  @Prop({ required: true })
  stateCode: string;

  @ApiProperty({
    description: 'Custom state name',
    example: 'Alexandria - الإسكندرية',
  })
  @Prop({ required: true })
  stateName: string;

  @ApiProperty({ description: 'Original WooCommerce name (for reference)' })
  @Prop()
  originalName: string;

  @ApiProperty({ description: 'Groups this state belongs to' })
  @Prop({ type: [{ type: Types.ObjectId, ref: 'StateGroup' }], default: [] })
  groups: Types.ObjectId[];

  @ApiProperty({ description: 'Owner user ID' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @ApiProperty({
    description: 'Whether this is a new state (not in WooCommerce)',
  })
  @Prop({ default: false })
  isNew: boolean;

  @ApiProperty({
    description: 'Whether this state is enabled for WooCommerce checkout',
    default: true,
  })
  @Prop({ default: true })
  enabled: boolean;

  @ApiProperty({ description: 'Display order within country' })
  @Prop({ default: 0 })
  order: number;

  @ApiProperty({ description: 'Additional notes' })
  @Prop()
  notes: string;
}

export const LocalStateSchema = SchemaFactory.createForClass(LocalState);

// Indexes
LocalStateSchema.index({ ownerId: 1, countryCode: 1 });
LocalStateSchema.index(
  { ownerId: 1, countryCode: 1, stateCode: 1 },
  { unique: true },
);
LocalStateSchema.index({ ownerId: 1, groups: 1 });
