import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './service';
import {
  QueryAnalyticsDto,
  QueryAnalyticsSchema,
  QueryProfitSummaryDto,
  QueryProfitSummarySchema,
} from './dto.query';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller(':lang/analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard analytics' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
  })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryAnalyticsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async getDashboard(
    @User('_id') userId: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getDashboard(userId, query);
  }

  @Get('profit-summary')
  @ApiOperation({
    summary: 'Get profit summary with revenue, costs, and margins',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    description: 'Grouping period (default: month)',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    type: Number,
    description: 'Number of months to look back (default: 12)',
  })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryProfitSummarySchema,
      param: { lang: LanguageSchema },
    }),
  )
  async getProfitSummary(
    @User('_id') userId: string,
    @Query() query: QueryProfitSummaryDto,
  ) {
    return this.analyticsService.getProfitSummary(userId, query);
  }
}
