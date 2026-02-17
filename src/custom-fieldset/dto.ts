import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import {
  FieldType,
  FieldsetStatus,
  AssignmentType,
  PriceModifierType,
  FieldsetScope,
} from './enum';

// ==================== Joi Sub-Schemas ====================

const FieldConditionJoiSchema = Joi.object().keys({
  fieldName: Joi.string().required(),
  operator: Joi.string()
    .valid('equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty')
    .required(),
  value: Joi.string().optional().allow('').default(''),
});

const ChildOptionJoiSchema = Joi.object().keys({
  label: Joi.string().required(),
  value: Joi.string().required(),
  image: Joi.string().uri().optional().allow(''),
  priceType: Joi.string()
    .valid(...Object.values(PriceModifierType))
    .optional()
    .default(PriceModifierType.NONE),
  priceAmount: Joi.number().optional().default(0),
  visible: Joi.boolean().optional().default(true),
});

const SwatchOptionJoiSchema = Joi.object().keys({
  label: Joi.string().required(),
  value: Joi.string().required(),
  image: Joi.string().uri().optional().allow(''),
  priceType: Joi.string()
    .valid(...Object.values(PriceModifierType))
    .optional()
    .default(PriceModifierType.NONE),
  priceAmount: Joi.number().optional().default(0),
  visible: Joi.boolean().optional().default(true),
  children: Joi.array().items(ChildOptionJoiSchema).optional().default([]),
});

const CustomFieldJoiSchema = Joi.object().keys({
  name: Joi.string().min(1).max(100).required(),
  label: Joi.string().min(1).max(255).required(),
  type: Joi.string()
    .valid(...Object.values(FieldType))
    .required(),
  required: Joi.boolean().optional().default(false),
  placeholder: Joi.string().optional().allow(''),
  min: Joi.number().optional(),
  max: Joi.number().optional(),
  checkboxLabel: Joi.string().optional().allow(''),
  // Price add-on
  priceType: Joi.string()
    .valid(...Object.values(PriceModifierType))
    .optional()
    .default(PriceModifierType.NONE),
  priceAmount: Joi.number().optional().default(0),
  // Conditional logic
  conditions: Joi.array().items(FieldConditionJoiSchema).optional().default([]),
  // Color picker
  defaultColor: Joi.string().optional().allow(''),
  // Date picker
  minDate: Joi.string().optional().allow(''),
  maxDate: Joi.string().optional().allow(''),
  // File upload
  allowedFileTypes: Joi.string().optional().allow(''),
  maxFileSize: Joi.number().optional(),
  // Demo image & note
  demoImage: Joi.string().uri().optional().allow(''),
  demoNote: Joi.string().max(500).optional().allow(''),
  // Compound field config
  parentLabel: Joi.string().max(255).optional().allow(''),
  parentType: Joi.string().valid('radio', 'dropdown', 'image_swatch').optional().allow(''),
  childLabel: Joi.string().max(255).optional().allow(''),
  childType: Joi.string().valid('radio', 'dropdown', 'image_swatch').optional().allow(''),
  // Options & position
  options: Joi.array().items(SwatchOptionJoiSchema).optional().default([]),
  visible: Joi.boolean().optional().default(true),
  position: Joi.number().min(0).optional().default(0),
}).when(Joi.object({ type: Joi.string().valid(FieldType.COMPOUND) }).unknown(), {
  then: Joi.object({
    parentLabel: Joi.string().min(1).max(255).required(),
    parentType: Joi.string().valid('radio', 'dropdown', 'image_swatch').required(),
    childLabel: Joi.string().min(1).max(255).required(),
    childType: Joi.string().valid('radio', 'dropdown', 'image_swatch').required(),
    options: Joi.array().items(SwatchOptionJoiSchema).min(1).required(),
  }),
});

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

// ==================== CREATE DTO ====================

export class CreateCustomFieldsetDto {
  name: string;
  status?: FieldsetStatus;
  scope?: FieldsetScope;
  assignmentType: AssignmentType;
  productIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  productTypes?: string[];
  attributeIds?: string[];
  fields: any[];
  position?: number;
}

export const CreateCustomFieldsetSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).required(),
  status: Joi.string()
    .valid(...Object.values(FieldsetStatus))
    .optional()
    .default(FieldsetStatus.ACTIVE),
  scope: Joi.string()
    .valid(...Object.values(FieldsetScope))
    .optional()
    .default(FieldsetScope.PRODUCT),
  assignmentType: Joi.string()
    .valid(...Object.values(AssignmentType))
    .required(),
  productIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional()
    .default([]),
  categoryIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional()
    .default([]),
  tagIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional()
    .default([]),
  productTypes: Joi.array()
    .items(Joi.string().valid('simple', 'variable', 'grouped', 'external'))
    .optional()
    .default([]),
  attributeIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional()
    .default([]),
  fields: Joi.array().items(CustomFieldJoiSchema).min(1).required(),
  position: Joi.number().min(0).optional().default(0),
});

// ==================== UPDATE DTO ====================

export class UpdateCustomFieldsetDto {
  name?: string;
  status?: FieldsetStatus;
  scope?: FieldsetScope;
  assignmentType?: AssignmentType;
  productIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  productTypes?: string[];
  attributeIds?: string[];
  fields?: any[];
  position?: number;
}

export const UpdateCustomFieldsetSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  status: Joi.string()
    .valid(...Object.values(FieldsetStatus))
    .optional(),
  scope: Joi.string()
    .valid(...Object.values(FieldsetScope))
    .optional(),
  assignmentType: Joi.string()
    .valid(...Object.values(AssignmentType))
    .optional(),
  productIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional(),
  categoryIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional(),
  tagIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional(),
  productTypes: Joi.array()
    .items(Joi.string().valid('simple', 'variable', 'grouped', 'external'))
    .optional(),
  attributeIds: Joi.array()
    .items(Joi.string().pattern(objectIdPattern))
    .optional(),
  fields: Joi.array().items(CustomFieldJoiSchema).min(1).optional(),
  position: Joi.number().min(0).optional(),
});

// ==================== REORDER DTO ====================

export class ReorderCustomFieldsetDto {
  items: { id: string; position: number }[];
  storeId: string;
}

export const ReorderCustomFieldsetSchema = Joi.object().keys({
  storeId: Joi.string().pattern(objectIdPattern).required(),
  items: Joi.array()
    .items(
      Joi.object().keys({
        id: Joi.string().pattern(objectIdPattern).required(),
        position: Joi.number().min(0).required(),
      }),
    )
    .min(1)
    .required(),
});

// ==================== QUERY DTO ====================

export class QueryCustomFieldsetDto {
  storeId?: string;
  status?: FieldsetStatus;
  scope?: FieldsetScope;
  assignmentType?: AssignmentType;
  keyword?: string;
  page?: number;
  size?: number;
}

export const QueryCustomFieldsetSchema = Joi.object().keys({
  storeId: Joi.string().pattern(objectIdPattern).optional(),
  status: Joi.string()
    .valid(...Object.values(FieldsetStatus))
    .optional(),
  scope: Joi.string()
    .valid(...Object.values(FieldsetScope))
    .optional(),
  assignmentType: Joi.string()
    .valid(...Object.values(AssignmentType))
    .optional(),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(50),
});
