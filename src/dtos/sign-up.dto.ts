import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';
import { EmailSchema } from './email.dto';
import { genderEnum } from 'src/enums/gender.enum';
import { MongoIdSchema } from './mongo-id.dto';

export class SignUpDTO {
  @ApiProperty({ description: 'first Name', type: String, required: true })
  firstName: string;

  @ApiProperty({ description: 'father Name', type: String, required: true })
  lastName: string;

  @ApiProperty({ description: 'Email', type: String, required: true })
  email: string;

  @ApiProperty({ description: 'Password', required: true })
  password?: string;
}

export const SignUpSchema = Joi.object().keys({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: EmailSchema.required(),
  password: Joi.string().required(),
});
