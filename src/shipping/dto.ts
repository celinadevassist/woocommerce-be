import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

// ============== SHIPPING ZONE DTOs ==============

export class CreateShippingZoneDto {
  @ApiProperty({ description: 'Zone name' })
  name: string;

  @ApiPropertyOptional({ description: 'Zone order/priority' })
  order?: number;
}

export const CreateShippingZoneSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).required(),
  order: Joi.number().min(0).optional(),
});

export class UpdateShippingZoneDto {
  @ApiPropertyOptional({ description: 'Zone name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Zone order/priority' })
  order?: number;
}

export const UpdateShippingZoneSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  order: Joi.number().min(0).optional(),
});

// ============== SHIPPING ZONE LOCATION DTOs ==============

export class ShippingZoneLocationDto {
  @ApiProperty({ description: 'Location code (e.g., US, US:CA, 90210)' })
  code: string;

  @ApiProperty({ description: 'Location type', enum: ['postcode', 'state', 'country', 'continent'] })
  type: 'postcode' | 'state' | 'country' | 'continent';
}

export class UpdateShippingZoneLocationsDto {
  @ApiProperty({ description: 'List of locations', type: [ShippingZoneLocationDto] })
  locations: ShippingZoneLocationDto[];
}

export const UpdateShippingZoneLocationsSchema = Joi.object().keys({
  locations: Joi.array().items(
    Joi.object({
      code: Joi.string().required(),
      type: Joi.string().valid('postcode', 'state', 'country', 'continent').required(),
    }),
  ).required(),
});

// ============== SHIPPING ZONE METHOD DTOs ==============

export class CreateShippingZoneMethodDto {
  @ApiProperty({ description: 'Method ID (flat_rate, free_shipping, local_pickup)' })
  methodId: string;

  @ApiPropertyOptional({ description: 'Method order/priority' })
  order?: number;

  @ApiPropertyOptional({ description: 'Enable method', default: true })
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Method settings' })
  settings?: Record<string, string>;
}

export const CreateShippingZoneMethodSchema = Joi.object().keys({
  methodId: Joi.string().valid('flat_rate', 'free_shipping', 'local_pickup').required(),
  order: Joi.number().min(0).optional(),
  enabled: Joi.boolean().optional(),
  settings: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
});

export class UpdateShippingZoneMethodDto {
  @ApiPropertyOptional({ description: 'Method order/priority' })
  order?: number;

  @ApiPropertyOptional({ description: 'Enable/disable method' })
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Method settings' })
  settings?: Record<string, string>;
}

export const UpdateShippingZoneMethodSchema = Joi.object().keys({
  order: Joi.number().min(0).optional(),
  enabled: Joi.boolean().optional(),
  settings: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
});

// ============== CUSTOM LOCATION DTOs ==============

export class CreateCustomStateDto {
  @ApiProperty({ description: 'Country code (e.g., EG, US)', example: 'EG' })
  countryCode: string;

  @ApiProperty({ description: 'State code (e.g., CAIRO, CA)', example: 'NEW_CAIRO' })
  stateCode: string;

  @ApiProperty({ description: 'State display name', example: 'New Cairo' })
  stateName: string;
}

export const CreateCustomStateSchema = Joi.object().keys({
  countryCode: Joi.string().min(2).max(2).uppercase().required(),
  stateCode: Joi.string().min(1).max(50).required(),
  stateName: Joi.string().min(1).max(255).required(),
});

export class UpdateCustomStateDto {
  @ApiProperty({ description: 'New state display name', example: 'New Cairo City' })
  stateName: string;
}

export const UpdateCustomStateSchema = Joi.object().keys({
  stateName: Joi.string().min(1).max(255).required(),
});

export class BulkUpdateStatesDto {
  @ApiProperty({
    description: 'List of states to set for the country',
    type: 'array',
    items: { type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' } } },
    example: [{ code: 'CAIRO', name: 'Cairo' }, { code: 'GIZA', name: 'Giza' }],
  })
  states: Array<{ code: string; name: string }>;
}

export const BulkUpdateStatesSchema = Joi.object().keys({
  states: Joi.array().items(
    Joi.object({
      code: Joi.string().min(1).max(50).required(),
      name: Joi.string().min(1).max(255).required(),
    }),
  ).required(),
});
