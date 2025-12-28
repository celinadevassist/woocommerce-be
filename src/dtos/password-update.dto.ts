import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class UpdatePasswordDTO {
    @ApiProperty({ description: 'User new Password', required: true })
    newPassword?: string;
}


export const UpdatePasswordSchema = Joi.object().keys({
    // password: Joi.string().regex(/^.*((?=.*[!@#$%^&*()\-_=+{};:,<.>]){1})(?=.*\d)((?=.*[a-z]){1})((?=.*[A-Z]){1}).*$/).required(),
    // newPassword: Joi.string().regex(/^.*((?=.*[!@#$%^&*()\-_=+{};:,<.>]){1})(?=.*\d)((?=.*[a-z]){1})((?=.*[A-Z]){1}).*$/).required(),
    newPassword: Joi.string().required(),

});
