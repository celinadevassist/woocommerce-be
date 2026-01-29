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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ReviewService } from './service';
import { QueryReviewDto, QueryReviewSchema } from './dto.query';
import {
  UpdateReviewDto,
  UpdateReviewSchema,
  ReplyReviewDto,
  ReplyReviewSchema,
} from './dto.update';
import {
  CreateReviewDto,
  CreateReviewSchema,
  RejectReviewDto,
  RejectReviewSchema,
  FeatureReviewDto,
  FeatureReviewSchema,
  BulkReviewIdsDto,
  BulkReviewIdsSchema,
  ReorderPhotosDto,
  ReorderPhotosSchema,
  UploadPhotoDto,
  UploadPhotoSchema,
} from './dto.create';
import {
  CreateResponseTemplateDto,
  CreateResponseTemplateSchema,
  UpdateResponseTemplateDto,
  UpdateResponseTemplateSchema,
} from './response-template.dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { LanguageSchema } from '../dtos/lang.dto';
import {
  ReviewStatus,
  ReviewType,
  ReviewSource,
  ModerationStatus,
} from './enum';
import { UploadedFile as UploadedFileType } from '../modules/s3-upload/s3-upload.service';
import { Multer } from 'multer';

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
  @UsePipes(
    new JoiValidationPipe({
      query: QueryReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(@User('_id') userId: string, @Query() query: QueryReviewDto) {
    return this.reviewService.findAll(userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review statistics' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getStats(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reviewService.getStats(userId, storeId);
  }

  @Get('new')
  @ApiOperation({ summary: 'Get new reviews from last 24 hours' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getNewReviews(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reviewService.getNewReviewsCount(userId, storeId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get review analytics and trends' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['week', 'month', 'quarter', 'year'],
  })
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
  @UsePipes(
    new JoiValidationPipe({
      query: QueryReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async exportCsv(
    @User('_id') userId: string,
    @Query() query: QueryReviewDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reviewService.exportToCsv(userId, query);
    const filename = `reviews-export-${
      new Date().toISOString().split('T')[0]
    }.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,
    );
    res.send(csv);
  }

  // ==================== CSV Import ====================

  @Post('import')
  @ApiOperation({ summary: 'Import reviews from CSV' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiResponse({ status: 201, description: 'Reviews imported successfully' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'storeId', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importFromCsv(
    @UploadedFile() file: Multer.File,
    @Query('storeId') storeId: string,
    @User('_id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!storeId) {
      throw new BadRequestException('Store ID is required');
    }

    return await this.reviewService.importFromCsv(
      userId,
      storeId,
      file.buffer.toString('utf-8'),
    );
  }

  @Get('import/template')
  @ApiOperation({ summary: 'Download CSV import template for reviews' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiResponse({ status: 200, description: 'Returns CSV template file' })
  async getImportTemplate(@Res() res: Response) {
    const headers = [
      'Reviewer',
      'Email',
      'Product',
      'Rating',
      'Review',
      'Verified',
      'Tags',
      'Date',
      'Auto Approve',
      'Auto Publish',
    ];

    const exampleRow = [
      'John Doe',
      'john@example.com',
      'Product Name or SKU',
      '5',
      'Great product! Highly recommended.',
      'yes',
      'quality; fast-shipping',
      '2025-01-15',
      'yes',
      'no',
    ];

    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(','), exampleRow.join(',')].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reviews-import-template.csv"',
    );
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
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
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
  @UsePipes(
    new JoiValidationPipe({
      body: ReplyReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
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
  @UsePipes(
    new JoiValidationPipe({
      body: CreateResponseTemplateSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async createTemplate(
    @User('_id') userId: string,
    @Body() dto: CreateResponseTemplateDto,
  ) {
    return this.reviewService.createResponseTemplate(userId, dto.storeId, dto);
  }

  @Patch('templates/:templateId')
  @ApiOperation({ summary: 'Update a response template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'templateId', description: 'Template ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateResponseTemplateSchema,
      param: { lang: LanguageSchema },
    }),
  )
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
  @ApiQuery({
    name: 'storeId',
    required: false,
    description: 'Limit sync to specific store',
  })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async syncRatings(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reviewService.syncAllProductRatings(userId, storeId);
  }

  // ==================== Manual Review Creation ====================

  @Post()
  @ApiOperation({ summary: 'Create a manual review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async createManualReview(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createManualReview(storeId, userId, dto);
  }

  // ==================== Photo Management ====================

  @Post(':id/photos')
  @ApiOperation({ summary: 'Upload a photo to a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        caption: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async uploadPhoto(
    @User('_id') userId: string,
    @Param('id') reviewId: string,
    @UploadedFile() file: Multer.File,
    @Body('caption') caption?: string,
  ) {
    const uploadedFile: UploadedFileType = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
    return this.reviewService.uploadPhoto(
      reviewId,
      userId,
      uploadedFile,
      caption,
    );
  }

  @Delete(':id/photos/:photoId')
  @ApiOperation({ summary: 'Remove a photo from a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiParam({ name: 'photoId', description: 'Photo ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async removePhoto(
    @User('_id') userId: string,
    @Param('id') reviewId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.reviewService.removePhoto(reviewId, photoId, userId);
  }

  @Post(':id/photos/reorder')
  @ApiOperation({ summary: 'Reorder photos in a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: ReorderPhotosSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async reorderPhotos(
    @User('_id') userId: string,
    @Param('id') reviewId: string,
    @Body() dto: ReorderPhotosDto,
  ) {
    return this.reviewService.reorderPhotos(reviewId, userId, dto.photoIds);
  }

  // ==================== Moderation ====================

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async approve(@User('_id') userId: string, @Param('id') reviewId: string) {
    return this.reviewService.approve(reviewId, userId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: RejectReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async reject(
    @User('_id') userId: string,
    @Param('id') reviewId: string,
    @Body() dto: RejectReviewDto,
  ) {
    return this.reviewService.reject(reviewId, userId, dto.reason);
  }

  @Post(':id/flag')
  @ApiOperation({ summary: 'Flag a review for further review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: RejectReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async flag(
    @User('_id') userId: string,
    @Param('id') reviewId: string,
    @Body() dto: RejectReviewDto,
  ) {
    return this.reviewService.flag(
      reviewId,
      userId,
      dto.reason || 'Flagged for review',
    );
  }

  @Post('bulk-approve')
  @ApiOperation({ summary: 'Bulk approve reviews' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkReviewIdsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkApprove(
    @User('_id') userId: string,
    @Body() dto: BulkReviewIdsDto,
  ) {
    return this.reviewService.bulkApprove(dto.reviewIds, userId);
  }

  @Post('bulk-reject')
  @ApiOperation({ summary: 'Bulk reject reviews' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkReviewIdsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkReject(@User('_id') userId: string, @Body() dto: BulkReviewIdsDto) {
    return this.reviewService.bulkReject(dto.reviewIds, userId, dto.reason);
  }

  // ==================== Publishing ====================

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async publish(@User('_id') userId: string, @Param('id') reviewId: string) {
    return this.reviewService.publish(reviewId, userId);
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: 'Unpublish a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async unpublish(@User('_id') userId: string, @Param('id') reviewId: string) {
    return this.reviewService.unpublish(reviewId, userId);
  }

  @Post('bulk-publish')
  @ApiOperation({ summary: 'Bulk publish reviews' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkReviewIdsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkPublish(
    @User('_id') userId: string,
    @Body() dto: BulkReviewIdsDto,
  ) {
    return this.reviewService.bulkPublish(dto.reviewIds, userId);
  }

  @Post(':id/feature')
  @ApiOperation({ summary: 'Feature a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: FeatureReviewSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async feature(
    @User('_id') userId: string,
    @Param('id') reviewId: string,
    @Body() dto: FeatureReviewDto,
  ) {
    return this.reviewService.feature(reviewId, userId, dto.order);
  }

  @Post(':id/unfeature')
  @ApiOperation({ summary: 'Unfeature a review' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async unfeature(@User('_id') userId: string, @Param('id') reviewId: string) {
    return this.reviewService.unfeature(reviewId, userId);
  }
}
