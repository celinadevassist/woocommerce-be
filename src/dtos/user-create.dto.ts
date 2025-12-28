import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';
import { statusEnum, systemStatusEnum } from '../enums';
import { EmailSchema } from './email.dto';

import { MongoIdSchema } from './mongo-id.dto';
import { genderEnum } from 'src/enums/gender.enum';

export class CreateUserDTO {
  @ApiProperty({ description: 'first Name', type: String, required: true })
  firstName: string;

  @ApiProperty({ description: 'father Name', type: String, required: true })
  lastName: string;

  @ApiProperty({ description: 'Email', type: String, required: false })
  email: string;

  @ApiProperty({ description: 'Mobile number', type: String, required: false })
  mobile?: string;

  @ApiProperty({ description: 'User skills', type: [String], required: false })
  skills?: string[];

  @ApiProperty({ description: 'Social media links', type: Object, required: false })
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    github?: string;
    website?: string;
  };

  @ApiProperty({ description: 'User location', type: String, required: false })
  location?: string;

  @ApiProperty({ description: 'Preferred language', type: String, required: false })
  preferredLanguage?: string;

  @ApiProperty({ description: 'User bio', type: String, required: false })
  bio?: string;

  @ApiProperty({ description: 'Visible to community', type: Boolean, required: false, default: false })
  visibleToCommunity?: boolean;
}

export const CreateUserSchema = Joi.object().keys({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: EmailSchema.allow("", null),
  mobile: Joi.string().allow(""),
  skills: Joi.array().items(Joi.string()),
  socialLinks: Joi.object({
    linkedin: Joi.string().allow(""),
    twitter: Joi.string().allow(""),
    whatsapp: Joi.string().allow(""),
    facebook: Joi.string().allow(""),
    instagram: Joi.string().allow(""),
    youtube: Joi.string().allow(""),
    github: Joi.string().allow(""),
    website: Joi.string().allow("")
  }),
  location: Joi.string().allow(""),
  preferredLanguage: Joi.string().allow(""),
  bio: Joi.string().allow(""),
  visibleToCommunity: Joi.boolean()
});