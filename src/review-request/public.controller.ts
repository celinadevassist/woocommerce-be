import { Controller, Get, Post, Param, Body, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ReviewRequestService } from './service';
import { SubmitReviewsDto, SubmitReviewsSchema } from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';

@ApiTags('Public Review Submission')
@Controller('public/review-request')
export class PublicReviewRequestController {
  constructor(private readonly reviewRequestService: ReviewRequestService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get review request by token (public)' })
  @ApiParam({ name: 'token', description: 'Review request token' })
  @ApiResponse({
    status: 200,
    description: 'Returns review request details for submission',
  })
  @ApiResponse({ status: 404, description: 'Token not found or expired' })
  async getByToken(@Param('token') token: string) {
    return this.reviewRequestService.getByToken(token);
  }

  @Post(':token/submit')
  @ApiOperation({ summary: 'Submit reviews (public)' })
  @ApiParam({ name: 'token', description: 'Review request token' })
  @ApiResponse({ status: 200, description: 'Reviews submitted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Token expired or reviews already submitted',
  })
  @UsePipes(new JoiValidationPipe({ body: SubmitReviewsSchema }))
  async submitReviews(
    @Param('token') token: string,
    @Body() dto: SubmitReviewsDto,
  ) {
    return this.reviewRequestService.submitReviews(token, dto);
  }
}
