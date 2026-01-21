import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReviewRequestService } from './service';
import {
  QueryReviewRequestDto,
  QueryReviewRequestSchema,
  UpdateReviewRequestSettingsDto,
  UpdateReviewRequestSettingsSchema,
  ManualTriggerDto,
  ManualTriggerSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { LanguageSchema } from '../dtos/lang.dto';
import { ReviewRequestStatus } from './enum';

@ApiTags('Review Requests')
@ApiBearerAuth()
@Controller(':lang/review-requests')
@UseGuards(AuthGuard('jwt'))
export class ReviewRequestController {
  constructor(private readonly reviewRequestService: ReviewRequestService) {}

  @Get()
  @ApiOperation({ summary: 'Get all review requests' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'status', enum: ReviewRequestStatus, required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryReviewRequestSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(
    @User('_id') userId: string,
    @Query() query: QueryReviewRequestDto,
  ) {
    return this.reviewRequestService.findAll(userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review request statistics' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getStats(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reviewRequestService.getStats(userId, storeId);
  }

  @Get('settings/:storeId')
  @ApiOperation({ summary: 'Get review request settings for a store' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getSettings(
    @User('_id') userId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.reviewRequestService.getSettings(storeId, userId);
  }

  @Put('settings/:storeId')
  @ApiOperation({ summary: 'Update review request settings for a store' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateReviewRequestSettingsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateSettings(
    @User('_id') userId: string,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateReviewRequestSettingsDto,
  ) {
    return this.reviewRequestService.updateSettings(storeId, userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single review request' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review Request ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.reviewRequestService.findById(id, userId);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Manually trigger a review request for an order' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(
    new JoiValidationPipe({
      body: ManualTriggerSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async manualTrigger(
    @User('_id') userId: string,
    @Body() dto: ManualTriggerDto,
  ) {
    return this.reviewRequestService.manualTrigger(dto.orderId, userId);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Resend a review request' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review Request ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async resend(@User('_id') userId: string, @Param('id') id: string) {
    return this.reviewRequestService.resend(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a review request' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Review Request ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async cancel(@User('_id') userId: string, @Param('id') id: string) {
    await this.reviewRequestService.cancel(id, userId);
    return { success: true };
  }
}
