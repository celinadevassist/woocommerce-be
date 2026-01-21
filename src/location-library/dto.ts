import * as Joi from 'joi';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============== STATE GROUP DTOs ==============

export class CreateStateGroupDto {
  @ApiProperty({ example: 'Greater Cairo' })
  name: string;

  @ApiProperty({ example: 'EG' })
  countryCode: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  color?: string;

  @ApiPropertyOptional({ example: 'Cairo and surrounding governorates' })
  description?: string;

  @ApiPropertyOptional({ example: 0 })
  order?: number;
}

export const CreateStateGroupSchema = Joi.object({
  name: Joi.string().required().min(1).max(100),
  countryCode: Joi.string().required().length(2).uppercase(),
  color: Joi.string()
    .optional()
    .allow('')
    .pattern(/^#[0-9A-Fa-f]{6}$|^$/),
  description: Joi.string().optional().allow('').max(500),
  order: Joi.number().optional().min(0),
});

export class UpdateStateGroupDto {
  @ApiPropertyOptional({ example: 'Greater Cairo Region' })
  name?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  color?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  order?: number;
}

export const UpdateStateGroupSchema = Joi.object({
  name: Joi.string().optional().min(1).max(100),
  color: Joi.string()
    .optional()
    .allow('')
    .pattern(/^#[0-9A-Fa-f]{6}$|^$/),
  description: Joi.string().optional().allow('').max(500),
  order: Joi.number().optional().min(0),
});

// ============== LOCAL STATE DTOs ==============

export class CreateLocalStateDto {
  @ApiProperty({ example: 'EG' })
  countryCode: string;

  @ApiProperty({ example: 'EGALX' })
  stateCode: string;

  @ApiProperty({ example: 'Alexandria - الإسكندرية' })
  stateName: string;

  @ApiPropertyOptional({ example: 'Alexandria' })
  originalName?: string;

  @ApiPropertyOptional({ example: ['groupId1', 'groupId2'] })
  groups?: string[];

  @ApiPropertyOptional({ example: false })
  isNew?: boolean;

  @ApiPropertyOptional({ example: 0 })
  order?: number;

  @ApiPropertyOptional({ example: 'Main port city' })
  notes?: string;
}

export const CreateLocalStateSchema = Joi.object({
  countryCode: Joi.string().required().length(2).uppercase(),
  stateCode: Joi.string().required().min(1).max(20),
  stateName: Joi.string().required().min(1).max(200),
  originalName: Joi.string().optional().allow('').max(200),
  groups: Joi.array().items(Joi.string().hex().length(24)).optional(),
  isNew: Joi.boolean().optional(),
  order: Joi.number().optional().min(0),
  notes: Joi.string().optional().allow('').max(500),
});

export class UpdateLocalStateDto {
  @ApiPropertyOptional({ example: 'Alexandria - الإسكندرية (Updated)' })
  stateName?: string;

  @ApiPropertyOptional({ example: ['groupId1', 'groupId2'] })
  groups?: string[];

  @ApiPropertyOptional({ example: 1 })
  order?: number;

  @ApiPropertyOptional({ example: 'Updated notes' })
  notes?: string;
}

export const UpdateLocalStateSchema = Joi.object({
  stateName: Joi.string().optional().min(1).max(200),
  groups: Joi.array().items(Joi.string().hex().length(24)).optional(),
  order: Joi.number().optional().min(0),
  notes: Joi.string().optional().allow('').max(500),
});

// ============== BULK OPERATIONS ==============

export class BulkCreateLocalStatesDto {
  @ApiProperty({ example: 'EG' })
  countryCode: string;

  @ApiProperty({
    example: [
      { stateCode: 'EGALX', stateName: 'Alexandria - الإسكندرية' },
      { stateCode: 'C', stateName: 'Cairo - القاهرة' },
    ],
  })
  states: Array<{
    stateCode: string;
    stateName: string;
    originalName?: string;
    groups?: string[];
    isNew?: boolean;
  }>;
}

export const BulkCreateLocalStatesSchema = Joi.object({
  countryCode: Joi.string().required().length(2).uppercase(),
  states: Joi.array()
    .items(
      Joi.object({
        stateCode: Joi.string().required().min(1).max(20),
        stateName: Joi.string().required().min(1).max(200),
        originalName: Joi.string().optional().max(200),
        groups: Joi.array().items(Joi.string().hex().length(24)).optional(),
        isNew: Joi.boolean().optional(),
      }),
    )
    .min(1)
    .required(),
});

// ============== SYNC TO STORE ==============

export class SyncToStoreDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  storeId: string;

  @ApiProperty({ example: 'EG' })
  countryCode: string;

  @ApiPropertyOptional({
    example: ['stateId1', 'stateId2'],
    description:
      'Specific state IDs to sync. If empty, syncs all states for the country.',
  })
  stateIds?: string[];
}

export const SyncToStoreSchema = Joi.object({
  storeId: Joi.string().required().hex().length(24),
  countryCode: Joi.string().required().length(2).uppercase(),
  stateIds: Joi.array()
    .items(Joi.string().hex().length(24))
    .optional()
    .allow(null),
});
