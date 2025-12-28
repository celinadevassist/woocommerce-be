import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class CreateOrganizationDto {
  @ApiProperty({ description: 'Organization name', example: 'My Company' })
  name: string;

  @ApiPropertyOptional({ description: 'Custom slug (auto-generated if not provided)', example: 'my-company' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Billing email address', example: 'billing@mycompany.com' })
  billingEmail?: string;
}

export const CreateOrganizationSchema = Joi.object().keys({
  name: Joi.string().min(2).max(100).required(),
  slug: Joi.string().min(2).max(50).lowercase().pattern(/^[a-z0-9-]+$/).optional(),
  billingEmail: Joi.string().email().optional(),
});
