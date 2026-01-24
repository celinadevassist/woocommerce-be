import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { ProductImportService } from './service';
import {
  FetchProductsDto,
  FetchProductsSchema,
  ExecuteImportDto,
  ExecuteImportSchema,
  LanguageSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import * as Joi from 'joi';

@ApiTags('Product Import')
@ApiBearerAuth()
@Controller(':lang/product-import')
@UseGuards(AuthGuard())
export class ProductImportController {
  constructor(private readonly productImportService: ProductImportService) {}

  @Post('fetch')
  @ApiOperation({
    summary: 'Fetch products from external source',
    description: 'Fetches products from an external store (Shopify) for preview before import',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'], description: 'Language' })
  @ApiResponse({ status: 200, description: 'Products fetched successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or source URL' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to store' })
  @UsePipes(
    new JoiValidationPipe({
      body: FetchProductsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async fetchProducts(@Body() dto: FetchProductsDto, @User() user: UserDocument) {
    return await this.productImportService.fetchProducts(dto, user._id.toString());
  }

  @Post('execute')
  @ApiOperation({
    summary: 'Execute product import',
    description: 'Starts importing selected products to WooCommerce with specified settings',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'], description: 'Language' })
  @ApiResponse({ status: 200, description: 'Import started successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'No access to store' })
  @UsePipes(
    new JoiValidationPipe({
      body: ExecuteImportSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async executeImport(@Body() dto: ExecuteImportDto, @User() user: UserDocument) {
    return await this.productImportService.executeImport(dto, user._id.toString());
  }

  @Get('status/:jobId')
  @ApiOperation({
    summary: 'Get import job status',
    description: 'Returns the current status and progress of an import job',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'], description: 'Language' })
  @ApiParam({ name: 'jobId', description: 'Import job ID' })
  @ApiResponse({ status: 200, description: 'Status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
        jobId: Joi.string()
          .regex(/^[a-f\d]{24}$/i)
          .required(),
      },
    }),
  )
  async getImportStatus(@Param('jobId') jobId: string, @User() user: UserDocument) {
    return await this.productImportService.getImportStatus(jobId, user._id.toString());
  }

  @Get('history/:storeId')
  @ApiOperation({
    summary: 'Get import history for a store',
    description: 'Returns a paginated list of past import jobs for the store',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'], description: 'Language' })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 403, description: 'No access to store' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
        storeId: Joi.string()
          .regex(/^[a-f\d]{24}$/i)
          .required(),
      },
      query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(10),
      }),
    }),
  )
  async getImportHistory(
    @Param('storeId') storeId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @User() user: UserDocument,
  ) {
    return await this.productImportService.getImportHistory(
      storeId,
      user._id.toString(),
      page,
      limit,
    );
  }

  @Get('attributes/:storeId')
  @ApiOperation({
    summary: 'Get WooCommerce attributes for a store',
    description: 'Returns all product attributes from the WooCommerce store for mapping',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'], description: 'Language' })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Attributes retrieved successfully' })
  @ApiResponse({ status: 403, description: 'No access to store' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
        storeId: Joi.string()
          .regex(/^[a-f\d]{24}$/i)
          .required(),
      },
    }),
  )
  async getStoreAttributes(@Param('storeId') storeId: string, @User() user: UserDocument) {
    return await this.productImportService.getStoreAttributes(storeId, user._id.toString());
  }

  @Post('cancel/:jobId')
  @ApiOperation({
    summary: 'Cancel a running import',
    description: 'Cancels a pending or running import job',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'], description: 'Language' })
  @ApiParam({ name: 'jobId', description: 'Import job ID' })
  @ApiResponse({ status: 200, description: 'Import cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed/failed job' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
        jobId: Joi.string()
          .regex(/^[a-f\d]{24}$/i)
          .required(),
      },
    }),
  )
  async cancelImport(@Param('jobId') jobId: string, @User() user: UserDocument) {
    return await this.productImportService.cancelImport(jobId, user._id.toString());
  }
}
