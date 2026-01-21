import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class ResetPasswordConfirmDTO {
  @ApiProperty({ description: 'user email', type: String, required: true })
  email?: string;
  @ApiProperty({ description: 'the otp', type: String, required: true })
  otp?: string;
  @ApiProperty({ description: 'User new Password', required: true })
  newPassword?: string;
}
export const ResetPasswordConfirmSchema = Joi.object().keys({
  email: Joi.string().required(),
  otp: Joi.string().required(),
  //newPassword: Joi.string().regex(/^.*((?=.*[!@#$%^&*()\-_=+{};:,<.>]){1})(?=.*\d)((?=.*[a-z]){1})((?=.*[A-Z]){1}).*$/).required(),
  newPassword: Joi.string().required(),
});
