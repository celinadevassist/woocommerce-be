import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class CreateResponseTemplateDto {
  @ApiProperty({ description: 'Store ID' })
  storeId: string;

  @ApiProperty({ description: 'Template name' })
  name: string;

  @ApiProperty({ description: 'Template content' })
  content: string;

  @ApiPropertyOptional({ description: 'Category', enum: ['positive', 'negative', 'neutral', 'thank-you', 'apology', 'general'] })
  category?: string;
}

export const CreateResponseTemplateSchema = Joi.object().keys({
  storeId: Joi.string().required(),
  name: Joi.string().required().min(1).max(100),
  content: Joi.string().required().min(1).max(5000),
  category: Joi.string().valid('positive', 'negative', 'neutral', 'thank-you', 'apology', 'general').optional(),
});

export class UpdateResponseTemplateDto {
  @ApiPropertyOptional({ description: 'Template name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Template content' })
  content?: string;

  @ApiPropertyOptional({ description: 'Category' })
  category?: string;
}

export const UpdateResponseTemplateSchema = Joi.object().keys({
  name: Joi.string().min(1).max(100).optional(),
  content: Joi.string().min(1).max(5000).optional(),
  category: Joi.string().valid('positive', 'negative', 'neutral', 'thank-you', 'apology', 'general').optional(),
});

export interface IResponseTemplate {
  _id: string;
  storeId: string;
  name: string;
  content: string;
  category?: string;
  usageCount: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
