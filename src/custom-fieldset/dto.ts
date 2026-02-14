import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { FieldType, FieldsetStatus, AssignmentType } from './enum';

// ==================== SUB DTOs ====================

export class SwatchOptionDto {
  @ApiProperty({ description: 'Option label' })
  label: string;

  @ApiProperty({ description: 'Option value' })
  value: string;

  @ApiPropertyOptional({ description: 'Image URL for swatch' })
  image?: string;
}

export class CustomFieldDto {
  @ApiProperty({ description: 'Internal field name' })
  name: string;

  @ApiProperty({ description: 'Display label on product page' })
  label: string;

  @ApiProperty({ description: 'Field type', enum: FieldType })
  type: FieldType;

  @ApiPropertyOptional({ description: 'Whether field is required' })
  required?: boolean;

  @ApiPropertyOptional({ description: 'Placeholder for text fields' })
  placeholder?: string;

  @ApiPropertyOptional({
    description: 'Options for image_swatch fields',
    type: [SwatchOptionDto],
  })
  options?: SwatchOptionDto[];

  @ApiPropertyOptional({ description: 'Display order' })
  position?: number;
}

// ==================== Joi Sub-Schemas ====================

const SwatchOptionSchema = Joi.object().keys({
  label: Joi.string().required(),
  value: Joi.string().required(),
  image: Joi.string().uri().optional().allow(''),
});

const CustomFieldSchema = Joi.object().keys({
  name: Joi.string().min(1).max(100).required(),
  label: Joi.string().min(1).max(255).required(),
  type: Joi.string()
    .valid(...Object.values(FieldType))
    .required(),
  required: Joi.boolean().optional().default(false),
  placeholder: Joi.string().optional().allow(''),
  options: Joi.array().items(SwatchOptionSchema).optional().default([]),
  position: Joi.number().min(0).optional().default(0),
});

// ==================== CREATE DTO ====================

export class CreateCustomFieldsetDto {
  @ApiProperty({ description: 'Fieldset name' })
  name: string;

  @ApiPropertyOptional({ description: 'Status', enum: FieldsetStatus })
  status?: FieldsetStatus;

  @ApiProperty({ description: 'Assignment type', enum: AssignmentType })
  assignmentType: AssignmentType;

  @ApiPropertyOptional({ description: 'Product IDs (when assignmentType=product)' })
  productIds?: string[];

  @ApiPropertyOptional({ description: 'Category IDs (when assignmentType=category)' })
  categoryIds?: string[];

  @ApiProperty({ description: 'Fields in this fieldset', type: [CustomFieldDto] })
  fields: CustomFieldDto[];

  @ApiPropertyOptional({ description: 'Sort position' })
  position?: number;
}

export const CreateCustomFieldsetSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).required(),
  status: Joi.string()
    .valid(...Object.values(FieldsetStatus))
    .optional()
    .default(FieldsetStatus.ACTIVE),
  assignmentType: Joi.string()
    .valid(...Object.values(AssignmentType))
    .required(),
  productIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .optional()
    .default([]),
  categoryIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .optional()
    .default([]),
  fields: Joi.array().items(CustomFieldSchema).min(1).required(),
  position: Joi.number().min(0).optional().default(0),
});

// ==================== UPDATE DTO ====================

export class UpdateCustomFieldsetDto {
  @ApiPropertyOptional({ description: 'Fieldset name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Status', enum: FieldsetStatus })
  status?: FieldsetStatus;

  @ApiPropertyOptional({ description: 'Assignment type', enum: AssignmentType })
  assignmentType?: AssignmentType;

  @ApiPropertyOptional({ description: 'Product IDs' })
  productIds?: string[];

  @ApiPropertyOptional({ description: 'Category IDs' })
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'Fields', type: [CustomFieldDto] })
  fields?: CustomFieldDto[];

  @ApiPropertyOptional({ description: 'Sort position' })
  position?: number;
}

export const UpdateCustomFieldsetSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  status: Joi.string()
    .valid(...Object.values(FieldsetStatus))
    .optional(),
  assignmentType: Joi.string()
    .valid(...Object.values(AssignmentType))
    .optional(),
  productIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .optional(),
  categoryIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .optional(),
  fields: Joi.array().items(CustomFieldSchema).min(1).optional(),
  position: Joi.number().min(0).optional(),
});

// ==================== QUERY DTO ====================

export class QueryCustomFieldsetDto {
  @ApiPropertyOptional({ description: 'Store ID' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Status filter', enum: FieldsetStatus })
  status?: FieldsetStatus;

  @ApiPropertyOptional({ description: 'Assignment type filter', enum: AssignmentType })
  assignmentType?: AssignmentType;

  @ApiPropertyOptional({ description: 'Search keyword' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  size?: number;
}

export const QueryCustomFieldsetSchema = Joi.object().keys({
  storeId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  status: Joi.string()
    .valid(...Object.values(FieldsetStatus))
    .optional(),
  assignmentType: Joi.string()
    .valid(...Object.values(AssignmentType))
    .optional(),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(50),
});
