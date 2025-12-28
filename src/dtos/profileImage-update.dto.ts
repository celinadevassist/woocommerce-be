import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class UpdateMyProfileImageDTO {
  @ApiProperty({ description: 'Profile Image', type: String, required: true })
  image: string;
}

export const UpdateMyProfileImageSchema = Joi.object().keys({
  image: Joi.string().required(),
});