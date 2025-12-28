import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';


export class CreateRoleDTO {
  @ApiProperty({description: 'role name', type: String, required: true})
  name?: string;
  @ApiProperty({description: 'array of scopes', type: [String], required: true})
  scopes?: string[];
}
export const CreateRoleSchema = Joi.object().keys({
  name: Joi.string().required(),
  scopes: Joi.array().items(Joi.string().regex(/^(.+\:.+)$/).required()).min(1).required()
});