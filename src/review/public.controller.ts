import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ReviewService } from './service';
import { StoreService } from '../store/service';
import { ReviewType } from './enum';

@ApiTags('Public Reviews API')
@Controller('public/reviews')
export class PublicReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly storeService: StoreService,
  ) {}

  /**
   * Validate store API key and return store ID
   */
  private async validateApiKey(apiKey: string): Promise<string> {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }

    const store = await this.storeService.findByPublicApiKey(apiKey);
    if (!store) {
      throw new NotFoundException('Invalid API key or store not found');
    }

    return store._id.toString();
  }

  @Get()
  @ApiOperation({ summary: 'Get published reviews (public)' })
  @ApiQuery({ name: 'api_key', required: true, description: 'Store public API key' })
  @ApiQuery({ name: 'product_id', required: false, description: 'Filter by product ID' })
  @ApiQuery({ name: 'type', required: false, enum: ReviewType, description: 'Filter by review type' })
  @ApiQuery({ name: 'featured', required: false, type: Boolean, description: 'Only featured reviews' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['createdAt', 'rating', 'helpfulCount'] })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Returns published reviews with pagination' })
  async getReviews(
    @Query('api_key') apiKey: string,
    @Query('product_id') productId?: string,
    @Query('type') reviewType?: ReviewType,
    @Query('featured') featured?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('sort_by') sortBy?: 'createdAt' | 'rating' | 'helpfulCount',
    @Query('sort_order') sortOrder?: 'asc' | 'desc',
  ) {
    const storeId = await this.validateApiKey(apiKey);

    return this.reviewService.getPublishedReviews(storeId, {
      productId,
      reviewType,
      featured: featured === 'true',
      page: page ? parseInt(page, 10) : 1,
      size: size ? parseInt(size, 10) : 10,
      sortBy,
      sortOrder,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get review summary statistics (public)' })
  @ApiQuery({ name: 'api_key', required: true, description: 'Store public API key' })
  @ApiResponse({ status: 200, description: 'Returns review summary with counts and averages' })
  async getSummary(@Query('api_key') apiKey: string) {
    const storeId = await this.validateApiKey(apiKey);
    return this.reviewService.getPublicSummary(storeId);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured reviews (public)' })
  @ApiQuery({ name: 'api_key', required: true, description: 'Store public API key' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max number of reviews (default: 5)' })
  @ApiResponse({ status: 200, description: 'Returns featured reviews sorted by order' })
  async getFeaturedReviews(
    @Query('api_key') apiKey: string,
    @Query('limit') limit?: string,
  ) {
    const storeId = await this.validateApiKey(apiKey);

    return this.reviewService.getPublishedReviews(storeId, {
      featured: true,
      size: limit ? parseInt(limit, 10) : 5,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single review by ID (public)' })
  @ApiQuery({ name: 'api_key', required: true, description: 'Store public API key' })
  @ApiResponse({ status: 200, description: 'Returns review details' })
  async getReview(
    @Param('id') id: string,
    @Query('api_key') apiKey: string,
  ) {
    const storeId = await this.validateApiKey(apiKey);

    // Get the review - it must be published and approved
    const result = await this.reviewService.getPublishedReviews(storeId, {
      page: 1,
      size: 1,
    });

    // Find the specific review by filtering from published reviews
    // Note: For performance, we might want to add a getPublicReviewById method
    const allReviews = await this.reviewService.getPublishedReviews(storeId, {
      size: 1000, // Fetch more to find the specific one
    });

    const review = allReviews.reviews.find((r) => r._id === id);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Increment view count
    await this.reviewService.incrementViewCount(id);

    return review;
  }

  @Post(':id/helpful')
  @ApiOperation({ summary: 'Mark a review as helpful (public)' })
  @ApiQuery({ name: 'api_key', required: true, description: 'Store public API key' })
  @ApiResponse({ status: 200, description: 'Helpful count incremented' })
  async markHelpful(
    @Param('id') id: string,
    @Query('api_key') apiKey: string,
  ) {
    await this.validateApiKey(apiKey);
    await this.reviewService.incrementHelpful(id);
    return { success: true, message: 'Marked as helpful' };
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Get reviews for a specific product (public)' })
  @ApiQuery({ name: 'api_key', required: true, description: 'Store public API key' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Returns product reviews with pagination' })
  async getProductReviews(
    @Param('productId') productId: string,
    @Query('api_key') apiKey: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const storeId = await this.validateApiKey(apiKey);

    return this.reviewService.getPublishedReviews(storeId, {
      productId,
      page: page ? parseInt(page, 10) : 1,
      size: size ? parseInt(size, 10) : 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }
}
