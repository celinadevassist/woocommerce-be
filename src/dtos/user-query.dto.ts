import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';
import { statusEnum } from '../enums';

export class QueryUserDTO {
  @ApiProperty({ description: 'first Name', type: String, required: false })
  firstName: string;

  @ApiProperty({ description: 'father Name', type: String, required: false })
  lastName: string;

  @ApiProperty({ description: `user status${Object.keys(statusEnum).join()}`, enum: statusEnum, required: false })
  status?: string;

  @ApiProperty({ description: 'created date', type: Date, required: false })
  createdAt?: Date;

  @ApiProperty({ description: 'Page number (starting from 1)', type: Number, required: false, default: 1 })
  page?: number;

  @ApiProperty({ description: 'Number of items per page', type: Number, required: false, default: 20 })
  limit?: number;

  @ApiProperty({ description: 'Search term to filter users', type: String, required: false })
  search?: string;

  @ApiProperty({ description: 'Filter users by skill', type: String, required: false })
  skill?: string;

  @ApiProperty({ description: 'Filter users by location', type: String, required: false })
  location?: string;
}

export const QueryUserSchema = Joi.object().keys({
  firstName: Joi.string(),
  lastName: Joi.string(),
  status: Joi.string().valid(...Object.keys(statusEnum)),
  createdAt: Joi.date(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  search: Joi.string().optional(),
  skill: Joi.string().optional(),
  location: Joi.string().optional(),
});
