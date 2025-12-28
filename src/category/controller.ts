import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoryService } from './service';
import {
  CreateCategoryDto,
  CreateCategorySchema,
  UpdateCategoryDto,
  UpdateCategorySchema,
  QueryCategoryDto,
  QueryCategorySchema,
} from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Category')
@ApiBearerAuth()
@Controller(':lang/category')
@UseGuards(AuthGuard('jwt'))
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post(':storeId')
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 404, description: 'Store or parent category not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateCategorySchema,
      param: { lang: LanguageSchema },
    }),
  )
  async create(
    @Param('storeId') storeId: string,
    @Body() dto: CreateCategoryDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.categoryService.create(user._id.toString(), storeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get categories for a store' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryCategorySchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(
    @Query() query: QueryCategoryDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.categoryService.findByStore(user._id.toString(), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiResponse({ status: 200, description: 'Category retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
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
    return await this.categoryService.findById(user._id.toString(), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Circular reference or self-parent' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateCategorySchema,
      param: { lang: LanguageSchema },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.categoryService.update(user._id.toString(), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category has subcategories' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async delete(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.categoryService.delete(user._id.toString(), id);
    return { message: 'Category deleted successfully' };
  }

  @Post('sync/:storeId')
  @ApiOperation({ summary: 'Sync categories from WooCommerce' })
  @ApiResponse({ status: 200, description: 'Categories synced successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async syncFromWooCommerce(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.categoryService.syncFromWooCommerce(user._id.toString(), storeId);
  }
}
