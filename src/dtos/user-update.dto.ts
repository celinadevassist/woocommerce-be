import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { statusEnum } from '../enums';
import { EmailSchema } from './email.dto';
import { roleEnum } from 'src/enums/user-role.enum';
import { MongoIdSchema } from './mongo-id.dto';
import { genderEnum } from 'src/enums/gender.enum';
import { MembershipStatus } from '../enums/membership.enum';
export class UpdateUserDTO {
  @ApiPropertyOptional({ example: 'Ahmed' })
  firstName: string;

  @ApiPropertyOptional({ example: 'Hassan' })
  lastName: string;

  @ApiPropertyOptional({ example: 'https://example.com/images/profile.jpg' })
  image: string;

  @ApiPropertyOptional({ example: '+201234567890' })
  mobile?: string;

  @ApiPropertyOptional({
    example: ['JavaScript', 'TypeScript', 'React', 'NestJS'],
  })
  skills?: string[];

  @ApiPropertyOptional({
    example: {
      linkedin: 'https://linkedin.com/in/ahmedhassan',
      twitter: 'https://twitter.com/ahmedhassan',
      github: 'https://github.com/ahmedhassan',
      website: 'https://ahmedhassan.dev',
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

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00Z' })
  lastActive?: Date;

  @ApiPropertyOptional({
    example: 'Senior full-stack developer with 5 years of experience',
  })
  bio?: string;

  @ApiPropertyOptional({ example: true })
  visibleToCommunity?: boolean;

  // Membership fields
  @ApiPropertyOptional({
    example: MembershipStatus.ACTIVE,
    enum: MembershipStatus,
  })
  membershipStatus?: MembershipStatus;

  @ApiPropertyOptional({ example: '2024-12-31T23:59:59Z' })
  membershipEndDate?: Date;

  @ApiPropertyOptional({ example: 99.99 })
  membershipPrice?: number;

  @ApiPropertyOptional({ example: 5 })
  specialistSessionsAttended?: number;
}

export const UpdateUserSchema = Joi.object().keys({
  firstName: Joi.string(),
  lastName: Joi.string(),
  image: Joi.string().allow(''),
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
  lastActive: Joi.date(),
  bio: Joi.string().allow(''),
  visibleToCommunity: Joi.boolean().allow(''),
  // Membership validation
  membershipStatus: Joi.string().valid(...Object.values(MembershipStatus)),
  membershipEndDate: Joi.date(),
  membershipPrice: Joi.number().min(0),
  specialistSessionsAttended: Joi.number().min(0),
});

export class RoleDTO {
  @ApiProperty({
    description: `role ${Object.keys(roleEnum).join()}`,
    enum: roleEnum,
    required: true,
  })
  role: string;
}

export const RoleSchema = Joi.object().keys({
  role: Joi.string()
    .valid(...Object.keys(roleEnum))
    .required(),
});
