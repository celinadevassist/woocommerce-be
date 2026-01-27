import { ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import { statusEnum } from '../enums';

export class QueryUserDTO {
  @ApiPropertyOptional({ example: 'Ahmed' })
  firstName: string;

  @ApiPropertyOptional({ example: 'Hassan' })
  lastName: string;

  @ApiPropertyOptional({ example: 'active', enum: statusEnum })
  status?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: 1, default: 1 })
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  limit?: number;

  @ApiPropertyOptional({ example: 'developer' })
  search?: string;

  @ApiPropertyOptional({ example: 'JavaScript' })
  skill?: string;

  @ApiPropertyOptional({ example: 'Cairo' })
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
