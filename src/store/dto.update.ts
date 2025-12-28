import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class UpdateStoreDto {
  @ApiPropertyOptional({ description: 'Store name', example: 'My Updated Store' })
  name?: string;

  @ApiPropertyOptional({ description: 'Enable auto sync', example: true })
  autoSync?: boolean;

  @ApiPropertyOptional({ description: 'Sync interval in minutes', example: 15 })
  syncInterval?: number;

  @ApiPropertyOptional({ description: 'Low stock threshold', example: 10 })
  lowStockThreshold?: number;

  @ApiPropertyOptional({ description: 'Store timezone', example: 'Africa/Cairo' })
  timezone?: string;
}

export const UpdateStoreSchema = Joi.object().keys({
  name: Joi.string().min(2).max(100).optional(),
  autoSync: Joi.boolean().optional(),
  syncInterval: Joi.number().min(5).max(1440).optional(), // 5 mins to 24 hours
  lowStockThreshold: Joi.number().min(0).optional(),
  timezone: Joi.string().optional(),
});

export class UpdateCredentialsDto {
  @ApiPropertyOptional({ description: 'WooCommerce Consumer Key' })
  consumerKey?: string;

  @ApiPropertyOptional({ description: 'WooCommerce Consumer Secret' })
  consumerSecret?: string;
}

export const UpdateCredentialsSchema = Joi.object().keys({
  consumerKey: Joi.string().optional(),
  consumerSecret: Joi.string().optional(),
}).or('consumerKey', 'consumerSecret'); // At least one required
