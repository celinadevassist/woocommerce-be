import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class QueryRoleDTO {
  @ApiProperty({description: 'role name', type: String, required: false})
  name?: string;
  
  @ApiProperty({description: 'scope', type: String, required: false})
  scope?: string;
  
  @ApiProperty({ description: 'the page no for pangination', required: false })
  page: string;

  @ApiProperty({ description: 'the size of the page for pangination with max 1000, default 20', required: false })
  size: string;
}
export const QueryRoleSchema = Joi.object().keys({
  name: Joi.string(),
  scope: Joi.string().regex(/^(.+\:.+)$/),
  size: Joi.number().min(1).max(1000),
  page: Joi.number().min(1),
});
