import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SearchAnalyticsService } from './search-analytics.service';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../../decorators';
import { UserDocument } from '../../schema/user.schema';
import { SearchAnalyticsQueryDto } from './dto/search-analytics.dto';

@ApiTags('Admin - Search Analytics')
@Controller(':lang/admin/search-analytics')
export class SearchAnalyticsController {
  constructor(private readonly searchAnalyticsService: SearchAnalyticsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard())
  @ApiOperation({
    summary: 'Get search analytics (Admin only)',
    description: 'Returns analytics data about search queries made by clients. Includes search terms, frequency, result counts, and timestamps. Admin access required.'
  })
  @ApiParam({ name: 'lang', description: 'Language code', enum: ['en', 'ar'], example: 'en' })
  @ApiQuery({ name: 'endpoint', required: false, description: 'Filter by endpoint type (e.g., projects, image-prompts, sessions, articles, questions)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO 8601)', example: '2025-01-01T00:00:00.000Z' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO 8601)', example: '2025-12-31T23:59:59.999Z' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'size', required: false, type: Number, description: 'Items per page', example: 20 })
  @ApiQuery({ name: 'groupByTerm', required: false, type: Boolean, description: 'Group results by search term', example: false })
  @ApiResponse({
    status: 200,
    description: 'Search analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Search query records or aggregated data'
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            size: { type: 'number' },
            totalPages: { type: 'number' }
          }
        },
        summary: {
          type: 'object',
          properties: {
            totalSearches: { type: 'number' },
            uniqueSearchTerms: { type: 'number' },
            averageResultCount: { type: 'number' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async getSearchAnalytics(
    @Query('endpoint') endpoint?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('groupByTerm') groupByTerm?: string,
    @User() user?: UserDocument
  ) {
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Only administrators can access search analytics');
    }

    const query: SearchAnalyticsQueryDto = {
      endpoint,
      startDate,
      endDate,
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      groupByTerm: groupByTerm === 'true'
    };

    return await this.searchAnalyticsService.getSearchAnalytics(query);
  }
}
