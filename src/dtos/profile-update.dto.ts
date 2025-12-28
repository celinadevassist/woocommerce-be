import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';
import { EmailSchema } from './email.dto';
import { MongoIdSchema } from './mongo-id.dto';

// tslint:disable-next-line: max-classes-per-file
export class UpdateMyProfileDTO {
  @ApiProperty({ description: 'first Name', type: String, required: false })
  firstName: string;

  @ApiProperty({ description: 'father Name', type: String, required: false })
  lastName: string;

  @ApiProperty({ description: 'image', type: String, required: false })
  image: string;

  @ApiProperty({ description: 'mobile', type: String, required: false })
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

  // @ApiProperty({ description: 'Last active timestamp', type: Date, required: false })
  // lastActive?: Date;

  @ApiProperty({ description: 'bio', type: String, required: false })
  bio?: string;

  @ApiProperty({ description: 'visible To Community', type: Boolean, required: false })
  visibleToCommunity?: boolean;

  // @ApiProperty({ description: 'QA ID', type: String, required: false })
  // QAId?: string;

  // @ApiProperty({ description: 'Paragraph ID', type: String, required: false })
  // paragraphId?: string;

  // @ApiProperty({ description: 'Preferred Language', type: String, required: false })
  // preferedLang?: string;
}

export const UpdateMyProfileSchema = Joi.object().keys({
  firstName: Joi.string(),
  lastName: Joi.string(),
  image: Joi.string().allow(""),
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
  // lastActive: Joi.date(),
  bio: Joi.string().allow(""),
  visibleToCommunity: Joi.boolean(),

  // QAId: MongoIdSchema.allow(""),
  // paragraphId: MongoIdSchema.allow(""),
  // preferedLang: Joi.string(),
});