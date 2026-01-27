import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';
import { MongoIdSchema } from './mongo-id.dto';

export class SignInDTO {
  @ApiProperty({
    description: 'email',
    type: String,
    required: false,
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Password',
    type: String,
    required: true,
    example: 'Password123!',
  })
  password?: string;
}
export const SignInSchema = Joi.object().keys({
  email: Joi.string().email(),
  password: Joi.string().required(),
});
