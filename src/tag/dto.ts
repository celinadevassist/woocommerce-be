import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class CreateTagDto {
  @ApiProperty({ description: 'Tag name' })
  name: string;

  @ApiPropertyOptional({ description: 'Tag slug' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Tag description' })
  description?: string;
}

export const CreateTagSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).required(),
  slug: Joi.string().optional(),
  description: Joi.string().optional().allow(''),
});

export class UpdateTagDto {
  @ApiPropertyOptional({ description: 'Tag name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Tag slug' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Tag description' })
  description?: string;
}

export const UpdateTagSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  slug: Joi.string().optional(),
  description: Joi.string().optional().allow(''),
});

export class QueryTagDto {
  @ApiPropertyOptional({ description: 'Store ID' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Search keyword' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  size?: number;
}

export const QueryTagSchema = Joi.object().keys({
  storeId: Joi.string().optional(),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).optional(),
  size: Joi.number().min(1).optional(),
});
