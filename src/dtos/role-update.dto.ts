import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';


export class UpdateRoleDTO {
  @ApiProperty({description: 'array of scopes', type: [String], required: false})
  scopes?: string[];
}
export const UpdateRoleSchema = Joi.object().keys({
  scopes: Joi.array().items(Joi.string().regex(/^(.+\:.+)$/).required()).min(1)
});