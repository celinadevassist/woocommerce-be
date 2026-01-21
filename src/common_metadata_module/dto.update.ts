import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsObject, IsMongoId } from 'class-validator';
import * as Joi from 'joi';
import { ModuleType } from './enum';

export class UpdateMetadataDto {
  @ApiProperty({
    description: 'ID of the user this metadata belongs to',
    example: '60d21b4667d0d8992e610c85',
    required: false,
  })
  @IsMongoId()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    description: 'Module this metadata is for',
    enum: ModuleType,
    example: ModuleType.EMAIL_MARKETING,
    required: false,
  })
  @IsEnum(ModuleType)
  @IsOptional()
  forModule?: ModuleType;

  @ApiProperty({
    description: 'Metadata object containing flexible key-value pairs',
    example: {
      settings: { theme: 'light', notifications: false },
      preferences: { language: 'ar', timezone: 'GMT+3' },
    },
    type: 'object',
    required: false,
  })
  @IsObject()
  @IsOptional()
  meta?: Record<string, any>;
}

export const UpdateMetadataSchema = Joi.object({
  userId: Joi.string().optional(),
  forModule: Joi.string()
    .valid(...Object.values(ModuleType))
    .optional(),
  meta: Joi.object().optional(),
});
