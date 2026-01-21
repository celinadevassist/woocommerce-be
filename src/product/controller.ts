import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Multer } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ProductService } from './service';
import {
  UpdateProductDto,
  UpdateProductSchema,
  UpdateStockDto,
  UpdateStockSchema,
  BulkUpdateProductDto,
  BulkUpdateProductSchema,
  BulkUpdateVariantDto,
  BulkUpdateVariantSchema,
  CreateProductDto,
  CreateProductSchema,
  UpdateVariantDto,
  UpdateVariantSchema,
} from './dto.update';
import { QueryProductDto, QueryProductSchema } from './dto.query';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';
import { S3UploadService } from '../modules/s3-upload/s3-upload.service';

@ApiTags('Product')
@ApiBearerAuth()
@Controller(':lang/product')
@UseGuards(AuthGuard())
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all products with filters' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryProductSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(
    @Query() query: QueryProductDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.findAll(user._id.toString(), query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiQuery({
    name: 'pushToWoo',
    required: false,
    type: Boolean,
    description: 'Push to WooCommerce (default: true)',
  })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateProductSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async create(
    @Body() dto: CreateProductDto,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.create(
      user._id.toString(),
      dto,
      shouldPush,
    );
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get low stock products' })
  @ApiResponse({
    status: 200,
    description: 'Low stock products retrieved successfully',
  })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'threshold', required: false, type: Number })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getLowStock(
    @Query('storeId') storeId: string,
    @Query('threshold') threshold: number,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.getLowStockProducts(
      user._id.toString(),
      storeId,
      threshold ? Number(threshold) : undefined,
    );
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get product analytics and insights' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getAnalytics(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.getAnalytics(user._id.toString(), storeId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export products to CSV' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryProductSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async exportCsv(
    @Query() query: QueryProductDto,
    @User() user: UserDocument,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.productService.exportToCsv(
      user._id.toString(),
      query,
    );
    const filename = `products-export-${
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

  @Get('variants')
  @ApiOperation({ summary: 'Get all variants with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Variants retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({
    name: 'productId',
    required: false,
    description: 'Filter by parent product ID',
  })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'stockStatus', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    type: Number,
    description: 'Minimum price filter',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    type: Number,
    description: 'Maximum price filter',
  })
  @ApiQuery({
    name: 'attributes',
    required: false,
    description: 'JSON string of attribute filters',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async findAllVariants(
    @Query('storeId') storeId: string,
    @Query('productId') productId: string,
    @Query('keyword') keyword: string,
    @Query('stockStatus') stockStatus: string,
    @Query('status') status: string,
    @Query('lowStock') lowStock: string,
    @Query('minPrice') minPrice: string,
    @Query('maxPrice') maxPrice: string,
    @Query('attributes') attributes: string,
    @Query('page') page: string,
    @Query('size') size: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: 'asc' | 'desc',
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    // Parse attributes JSON if provided
    let parsedAttributes;
    if (attributes) {
      try {
        parsedAttributes = JSON.parse(attributes);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }

    return await this.productService.findAllVariants(user._id.toString(), {
      storeId,
      productId,
      keyword,
      stockStatus,
      status,
      lowStock: lowStock === 'true',
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      attributes: parsedAttributes,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('variants/attributes')
  @ApiOperation({ summary: 'Get all unique variant attributes for filtering' })
  @ApiResponse({
    status: 200,
    description: 'Attributes retrieved successfully',
  })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getVariantAttributes(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.getVariantAttributes(
      user._id.toString(),
      storeId,
    );
  }

  @Get('variants/:variantId')
  @ApiOperation({ summary: 'Get a single variant by ID' })
  @ApiResponse({ status: 200, description: 'Variant retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async findVariantById(
    @Param('variantId') variantId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.findVariantById(
      variantId,
      user._id.toString(),
    );
  }

  @Patch('variants/:variantId')
  @ApiOperation({ summary: 'Update a single variant' })
  @ApiResponse({ status: 200, description: 'Variant updated successfully' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  @ApiQuery({
    name: 'pushToWoo',
    required: false,
    type: Boolean,
    description: 'Push to WooCommerce (default: true)',
  })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateVariantSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateVariant(
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.updateVariant(
      variantId,
      user._id.toString(),
      dto,
      shouldPush,
    );
  }

  @Delete('variants/:variantId')
  @ApiOperation({ summary: 'Delete a variant' })
  @ApiResponse({ status: 200, description: 'Variant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  @ApiQuery({
    name: 'deleteFromWoo',
    required: false,
    type: Boolean,
    description: 'Delete from WooCommerce (default: true)',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async deleteVariant(
    @Param('variantId') variantId: string,
    @Query('deleteFromWoo') deleteFromWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldDelete = deleteFromWoo !== 'false';
    return await this.productService.deleteVariant(
      variantId,
      user._id.toString(),
      shouldDelete,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID with variants' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async findOne(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.findById(id, user._id.toString());
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'pushToWoo', required: false, type: Boolean })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateProductSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.update(
      id,
      user._id.toString(),
      dto,
      shouldPush,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product and all its variants' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'deleteFromWoo', required: false, type: Boolean, description: 'Delete from WooCommerce (default: true)' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async delete(
    @Param('id') id: string,
    @Query('deleteFromWoo') deleteFromWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldDelete = deleteFromWoo !== 'false';
    return await this.productService.delete(id, user._id.toString(), shouldDelete);
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: 'Update product stock' })
  @ApiResponse({ status: 200, description: 'Stock updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'pushToWoo', required: false, type: Boolean })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateStockSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.updateStock(
      id,
      user._id.toString(),
      dto,
      shouldPush,
    );
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Push product changes to WooCommerce' })
  @ApiResponse({ status: 200, description: 'Product synced successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async syncToWoo(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const product = await this.productService.findById(id, user._id.toString());
    // Get the actual document for sync
    const productDoc = await this.productService['productModel'].findById(id);
    await this.productService.syncProductToWoo(productDoc);
    return { message: 'Product synced to WooCommerce successfully' };
  }

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update multiple products' })
  @ApiResponse({ status: 200, description: 'Products updated successfully' })
  @ApiQuery({ name: 'pushToWoo', required: false, type: Boolean })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkUpdateProductSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkUpdate(
    @Body() dto: BulkUpdateProductDto,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.bulkUpdate(
      user._id.toString(),
      dto,
      shouldPush,
    );
  }

  @Post('variants/bulk-update')
  @ApiOperation({ summary: 'Bulk update multiple product variants' })
  @ApiResponse({ status: 200, description: 'Variants updated successfully' })
  @ApiQuery({ name: 'pushToWoo', required: false, type: Boolean })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkUpdateVariantSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkUpdateVariants(
    @Body() dto: BulkUpdateVariantDto,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.bulkUpdateVariants(
      user._id.toString(),
      dto,
      shouldPush,
    );
  }

  @Post('variants/search')
  @ApiOperation({ summary: 'Search variants by attributes' })
  @ApiResponse({ status: 200, description: 'Variants retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async searchVariantsByAttributes(
    @Body()
    body: { storeId: string; filters: { name: string; values: string[] }[] },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.searchVariantsByAttributes(
      user._id.toString(),
      body.storeId,
      body.filters,
    );
  }

  @Post(':id/generate-variations')
  @ApiOperation({ summary: 'Generate variations from attribute combinations' })
  @ApiResponse({
    status: 201,
    description: 'Variations generated successfully',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async generateVariations(
    @Param('id') id: string,
    @Body() body: { regularPrice?: string; sku?: string },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.productService.generateVariations(
      id,
      user._id.toString(),
      body,
    );
  }

  // ==================== IMAGE MANAGEMENT ====================

  @Post('upload-image')
  @ApiOperation({ summary: 'Upload a product image to S3' })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Multer.File,
    @User() user: UserDocument,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const result = await this.s3UploadService.uploadImage(
      file,
      file.originalname,
      `products/${user._id}`,
    );

    return {
      url: result.url,
      name: file.originalname,
      size: result.size,
      contentType: result.contentType,
    };
  }

  @Patch(':id/images')
  @ApiOperation({ summary: 'Update product images (add, remove, reorder)' })
  @ApiResponse({ status: 200, description: 'Images updated successfully' })
  @ApiQuery({ name: 'pushToWoo', required: false, type: Boolean })
  async updateImages(
    @Param('id') id: string,
    @Body()
    body: {
      images: {
        src: string;
        alt?: string;
        name?: string;
        position?: number;
        externalId?: number;
      }[];
    },
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.updateImages(
      id,
      user._id.toString(),
      body.images,
      shouldPush,
    );
  }

  @Delete(':id/images/:imageIndex')
  @ApiOperation({ summary: 'Delete a specific product image' })
  @ApiResponse({ status: 200, description: 'Image deleted successfully' })
  @ApiQuery({ name: 'pushToWoo', required: false, type: Boolean })
  async deleteImage(
    @Param('id') id: string,
    @Param('imageIndex') imageIndex: string,
    @Query('pushToWoo') pushToWoo: string,
    @User() user: UserDocument,
  ) {
    const shouldPush = pushToWoo !== 'false';
    return await this.productService.deleteImage(
      id,
      user._id.toString(),
      parseInt(imageIndex, 10),
      shouldPush,
    );
  }

  // ==================== CSV IMPORT ====================

  @Post('import')
  @ApiOperation({ summary: 'Import products from CSV' })
  @ApiResponse({ status: 201, description: 'Products imported successfully' })
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
    @User() user: UserDocument,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!storeId) {
      throw new BadRequestException('Store ID is required');
    }

    return await this.productService.importFromCsv(
      user._id.toString(),
      storeId,
      file.buffer.toString('utf-8'),
    );
  }

  @Get('import/template')
  @ApiOperation({ summary: 'Download CSV import template' })
  @ApiResponse({ status: 200, description: 'Returns CSV template file' })
  async getImportTemplate(@Res() res: Response) {
    const headers = [
      'Name',
      'SKU',
      'Type',
      'Status',
      'Regular Price',
      'Sale Price',
      'Manage Stock',
      'Stock Quantity',
      'Description',
      'Short Description',
      'Categories',
    ];

    const exampleRow = [
      'Example Product',
      'SKU-001',
      'simple',
      'publish',
      '99.99',
      '79.99',
      'yes',
      '50',
      'Full product description here',
      'Short description',
      'Category 1; Category 2',
    ];

    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(','), exampleRow.join(',')].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="products-import-template.csv"',
    );
    res.send(csv);
  }
}
