import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { StorePlatform } from './enum';

export class CreateStoreDto {
  @ApiProperty({ description: 'Store name', example: 'My WooCommerce Store' })
  name: string;

  @ApiPropertyOptional({
    description: 'E-commerce platform',
    enum: StorePlatform,
    default: StorePlatform.WOOCOMMERCE,
  })
  platform?: StorePlatform;

  @ApiProperty({ description: 'Store URL', example: 'https://mystore.com' })
  url: string;

  @ApiProperty({ description: 'WooCommerce Consumer Key' })
  consumerKey: string;

  @ApiProperty({ description: 'WooCommerce Consumer Secret' })
  consumerSecret: string;

  @ApiPropertyOptional({
    description: 'WordPress username for media management',
  })
  wpUsername?: string;

  @ApiPropertyOptional({
    description: 'WordPress application password for media management',
  })
  wpAppPassword?: string;
}

export const CreateStoreSchema = Joi.object().keys({
  name: Joi.string().min(2).max(100).required(),
  platform: Joi.string()
    .valid(...Object.values(StorePlatform))
    .default(StorePlatform.WOOCOMMERCE)
    .optional(),
  url: Joi.string().uri().required(),
  consumerKey: Joi.string().required(),
  consumerSecret: Joi.string().required(),
  wpUsername: Joi.string().optional(),
  wpAppPassword: Joi.string().optional(),
});
