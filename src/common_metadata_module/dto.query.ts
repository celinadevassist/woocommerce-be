import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, IsMongoId } from 'class-validator';
import * as Joi from 'joi';
import { ModuleType, MetadataOrderEnum, SortTypeEnum } from './enum';

export class QueryMetadataDto {
  @ApiProperty({
    description: 'Filter by user ID',
    required: false,
    example: '60d21b4667d0d8992e610c85',
  })
  @IsMongoId()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    description: 'Filter by module type',
    enum: ModuleType,
    required: false,
    example: ModuleType.EMAIL_MARKETING,
  })
  @IsEnum(ModuleType)
  @IsOptional()
  forModule?: ModuleType;

  @ApiProperty({
    description: 'General search term (searches within meta object values)',
    required: false,
    example: 'dark theme',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'Page number',
    type: Number,
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiProperty({
    description: 'Page size',
    type: Number,
    required: false,
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiProperty({
    description: 'Order by field',
    enum: MetadataOrderEnum,
    required: false,
    example: MetadataOrderEnum.createdAt,
  })
  @IsEnum(MetadataOrderEnum)
  @IsOptional()
  orderBy?: MetadataOrderEnum;

  @ApiProperty({
    description: 'Sort type',
    enum: SortTypeEnum,
    required: false,
    example: SortTypeEnum.DESCENDING,
  })
  @IsEnum(SortTypeEnum)
  @IsOptional()
  sortType?: SortTypeEnum;
}

export const QueryMetadataSchema = Joi.object({
  userId: Joi.string().optional(),
  forModule: Joi.string().valid(...Object.values(ModuleType)).optional(),
  search: Joi.string().optional(),
  page: Joi.number().optional(),
  size: Joi.number().optional(),
  orderBy: Joi.string().valid(...Object.values(MetadataOrderEnum)).optional(),
  sortType: Joi.string().valid(...Object.values(SortTypeEnum)).optional(),
}); 