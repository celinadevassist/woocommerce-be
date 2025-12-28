import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { StorePlatform } from './enum';

export class CreateStoreDto {
  @ApiProperty({ description: 'Organization ID', example: '507f1f77bcf86cd799439011' })
  organizationId: string;

  @ApiProperty({ description: 'Store name', example: 'My WooCommerce Store' })
  name: string;

  @ApiPropertyOptional({ description: 'E-commerce platform', enum: StorePlatform, default: StorePlatform.WOOCOMMERCE })
  platform?: StorePlatform;

  @ApiProperty({ description: 'Store URL', example: 'https://mystore.com' })
  url: string;

  @ApiProperty({ description: 'WooCommerce Consumer Key' })
  consumerKey: string;

  @ApiProperty({ description: 'WooCommerce Consumer Secret' })
  consumerSecret: string;
}

export const CreateStoreSchema = Joi.object().keys({
  organizationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  name: Joi.string().min(2).max(100).required(),
  platform: Joi.string().valid(...Object.values(StorePlatform)).default(StorePlatform.WOOCOMMERCE).optional(),
  url: Joi.string().uri().required(),
  consumerKey: Joi.string().required(),
  consumerSecret: Joi.string().required(),
});
