import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class SegmentRuleDto {
  @ApiProperty({ description: 'Field to filter on' })
  field: string;

  @ApiProperty({ description: 'Comparison operator' })
  operator: string;

  @ApiProperty({ description: 'Value to compare' })
  value: any;
}

export class CreateSegmentDto {
  @ApiPropertyOptional({ description: 'Store ID (optional if user has only one store)' })
  storeId?: string;

  @ApiProperty({ description: 'Segment name' })
  name: string;

  @ApiPropertyOptional({ description: 'Segment description' })
  description?: string;

  @ApiProperty({ description: 'Display color' })
  color: string;

  @ApiPropertyOptional({ description: 'Filter rules', type: [SegmentRuleDto] })
  rules?: SegmentRuleDto[];

  @ApiPropertyOptional({ description: 'Rule logic (and/or)', default: 'and' })
  ruleLogic?: string;
}

export const CreateSegmentSchema = Joi.object().keys({
  storeId: Joi.string().optional(),
  name: Joi.string().required().min(1).max(100),
  description: Joi.string().max(500).optional(),
  color: Joi.string().required(),
  rules: Joi.array().items(
    Joi.object({
      field: Joi.string().required(),
      operator: Joi.string().valid('eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in').required(),
      value: Joi.any().required(),
    })
  ).optional(),
  ruleLogic: Joi.string().valid('and', 'or').default('and').optional(),
});

export class UpdateSegmentDto {
  @ApiPropertyOptional({ description: 'Segment name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Segment description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Display color' })
  color?: string;

  @ApiPropertyOptional({ description: 'Filter rules', type: [SegmentRuleDto] })
  rules?: SegmentRuleDto[];

  @ApiPropertyOptional({ description: 'Rule logic (and/or)' })
  ruleLogic?: string;
}

export const UpdateSegmentSchema = Joi.object().keys({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  color: Joi.string().optional(),
  rules: Joi.array().items(
    Joi.object({
      field: Joi.string().required(),
      operator: Joi.string().valid('eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in').required(),
      value: Joi.any().required(),
    })
  ).optional(),
  ruleLogic: Joi.string().valid('and', 'or').optional(),
});

export interface ISegmentRule {
  field: string;
  operator: string;
  value: any;
}

export interface ICustomerSegment {
  _id: string;
  storeId: string;
  name: string;
  description?: string;
  color: string;
  rules: ISegmentRule[];
  ruleLogic: string;
  customerCount: number;
  lastCountUpdated?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
