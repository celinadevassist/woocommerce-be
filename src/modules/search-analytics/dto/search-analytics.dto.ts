import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SearchAnalyticsQueryDto {
  @ApiProperty({
    required: false,
    description:
      'Filter by endpoint type (e.g., projects, image-prompts, sessions, articles, questions, tools, quotes)',
    example: 'projects',
  })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiProperty({
    required: false,
    description: 'Start date for filtering (ISO 8601 format)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End date for filtering (ISO 8601 format)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Page number',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({
    required: false,
    description: 'Items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  size?: number;

  @ApiProperty({
    required: false,
    description: 'Group results by search term to get aggregated counts',
    example: true,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  groupByTerm?: boolean;
}
