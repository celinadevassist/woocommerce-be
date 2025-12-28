import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ description: 'Organization name', example: 'My Updated Company' })
  name?: string;

  @ApiPropertyOptional({ description: 'Billing email address', example: 'billing@mycompany.com' })
  billingEmail?: string;
}

export const UpdateOrganizationSchema = Joi.object().keys({
  name: Joi.string().min(2).max(100).optional(),
  billingEmail: Joi.string().email().optional(),
});
