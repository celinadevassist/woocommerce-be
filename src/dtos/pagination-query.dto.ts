import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class PaginationQueryDTO {
  @ApiProperty({
    description: 'Page number (starting from 1)',
    type: Number,
    required: false,
    default: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    required: false,
    default: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Search term to filter users',
    type: String,
    required: false,
  })
  search?: string;

  @ApiProperty({
    description: 'Filter users by skill',
    type: String,
    required: false,
  })
  skill?: string;

  @ApiProperty({
    description: 'Filter users by location',
    type: String,
    required: false,
  })
  location?: string;
}

export const PaginationQuerySchema = Joi.object().keys({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  search: Joi.string().optional(),
  skill: Joi.string().optional(),
  location: Joi.string().optional(),
});
