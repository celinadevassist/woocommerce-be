import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ReviewService } from './service';
import { QueryReviewDto, QueryReviewSchema } from './dto.query';
import { UpdateReviewDto, UpdateReviewSchema, ReplyReviewDto, ReplyReviewSchema } from './dto.update';
import {
  CreateResponseTemplateDto,
  CreateResponseTemplateSchema,
  UpdateResponseTemplateDto,
  UpdateResponseTemplateSchema,
} from './response-template.dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { LanguageSchema } from '../dtos/lang.dto';
import { ReviewStatus } from './enum';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller(':lang/reviews')
@UseGuards(AuthGuard('jwt'))
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @ApiOperation({ summary: 'Get all reviews with filtering' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'status', enum: ReviewStatus, required: false })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  @ApiQuery({ name: 'maxRating', required: false, type: Number })
  @ApiQuery({ name: 'verified', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryReviewSchema, param: { lang: LanguageSchema } }))
  async findAll(@User('_id') userId: string, @Query() query: QueryReviewDto) {
    return this.reviewService.findAll(userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review statistics' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getStats(@User('_id') userId: string, @Query('storeId') storeId?: string) {
    return this.reviewService.getStats(userId, storeId);
  }

  @Get('new')
  @ApiOperation({ summary: 'Get new reviews from last 24 hours' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getNewReviews(@User('_id') userId: string, @Query('storeId') storeId?: string) {
    return this.reviewService.getNewReviewsCount(userId, storeId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get review analytics and trends' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter', 'year'] })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getAnalytics(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
    @Query('period') period?: 'week' | 'month' | 'quarter' | 'year',
  ) {
    return this.reviewService.getAnalytics(userId, storeId, period);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export reviews to CSV' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @UsePipes(new JoiValidationPipe({ query: QueryReviewSchema, param: { lang: LanguageSchema } }))
  async exportCsv(
    @User('_id') userId: string,
    @Query() query: QueryReviewDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reviewService.exportToCsv(userId, query);
    const filename = `reviews-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get review by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.reviewService.findById(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateReviewSchema, param: { lang: LanguageSchema } }))
  async update(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.update(id, userId, dto);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Reply to a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ body: ReplyReviewSchema, param: { lang: LanguageSchema } }))
  async reply(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewService.reply(id, userId, dto);
  }

  // ==================== Response Templates ====================

  @Get('templates/list')
  @ApiOperation({ summary: 'Get all response templates' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'category', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getTemplates(
    @User('_id') userId: string,
    @Query('category') category?: string,
  ) {
    return this.reviewService.getResponseTemplates(userId, category);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a response template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: CreateResponseTemplateSchema, param: { lang: LanguageSchema } }))
  async createTemplate(
    @User('_id') userId: string,
    @Body() dto: CreateResponseTemplateDto,
  ) {
    return this.reviewService.createResponseTemplate(userId, dto);
  }

  @Patch('templates/:templateId')
  @ApiOperation({ summary: 'Update a response template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateResponseTemplateSchema, param: { lang: LanguageSchema } }))
  async updateTemplate(
    @User('_id') userId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateResponseTemplateDto,
  ) {
    return this.reviewService.updateResponseTemplate(templateId, userId, dto);
  }

  @Delete('templates/:templateId')
  @ApiOperation({ summary: 'Delete a response template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async deleteTemplate(
    @User('_id') userId: string,
    @Param('templateId') templateId: string,
  ) {
    await this.reviewService.deleteResponseTemplate(templateId, userId);
    return { success: true };
  }

  @Post('templates/:templateId/use')
  @ApiOperation({ summary: 'Increment template usage count' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async useTemplate(@Param('templateId') templateId: string) {
    await this.reviewService.incrementTemplateUsage(templateId);
    return { success: true };
  }

  // ==================== Rating Sync ====================

  @Post('sync-ratings')
  @ApiOperation({ summary: 'Sync average ratings to all products' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false, description: 'Limit sync to specific store' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async syncRatings(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reviewService.syncAllProductRatings(userId, storeId);
  }
}
