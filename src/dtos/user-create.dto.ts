import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { statusEnum, systemStatusEnum } from '../enums';
import { EmailSchema } from './email.dto';

import { MongoIdSchema } from './mongo-id.dto';
import { genderEnum } from 'src/enums/gender.enum';

export class CreateUserDTO {
  @ApiProperty({ example: 'Ahmed' })
  firstName: string;

  @ApiProperty({ example: 'Hassan' })
  lastName: string;

  @ApiPropertyOptional({ example: 'ahmed.hassan@example.com' })
  email: string;

  @ApiPropertyOptional({ example: '+201234567890' })
  mobile?: string;

  @ApiPropertyOptional({ example: ['JavaScript', 'React', 'Node.js'] })
  skills?: string[];

  @ApiPropertyOptional({
    example: {
      linkedin: 'https://linkedin.com/in/ahmedhassan',
      twitter: 'https://twitter.com/ahmedhassan',
      github: 'https://github.com/ahmedhassan',
    },
  })
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

  @ApiPropertyOptional({ example: 'Cairo, Egypt' })
  location?: string;

  @ApiPropertyOptional({ example: 'en' })
  preferredLanguage?: string;

  @ApiPropertyOptional({ example: 'Full-stack developer passionate about building scalable web applications' })
  bio?: string;

  @ApiPropertyOptional({ example: true })
  visibleToCommunity?: boolean;
}

export const CreateUserSchema = Joi.object().keys({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: EmailSchema.allow('', null),
  mobile: Joi.string().allow(''),
  skills: Joi.array().items(Joi.string()),
  socialLinks: Joi.object({
    linkedin: Joi.string().allow(''),
    twitter: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    facebook: Joi.string().allow(''),
    instagram: Joi.string().allow(''),
    youtube: Joi.string().allow(''),
    github: Joi.string().allow(''),
    website: Joi.string().allow(''),
  }),
  location: Joi.string().allow(''),
  preferredLanguage: Joi.string().allow(''),
  bio: Joi.string().allow(''),
  visibleToCommunity: Joi.boolean(),
});
