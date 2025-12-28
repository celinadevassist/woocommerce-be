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
import { TagService } from './service';
import {
  CreateTagDto,
  CreateTagSchema,
  UpdateTagDto,
  UpdateTagSchema,
  QueryTagDto,
  QueryTagSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Tag')
@ApiBearerAuth()
@Controller(':lang/tag')
@UseGuards(AuthGuard('jwt'))
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post(':storeId')
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateTagSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async create(
    @Param('storeId') storeId: string,
    @Body() dto: CreateTagDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.tagService.create(user._id.toString(), storeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get tags for a store' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryTagSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(
    @Query() query: QueryTagDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.tagService.findByStore(user._id.toString(), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tag by ID' })
  @ApiResponse({ status: 200, description: 'Tag retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
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
    return await this.tagService.findById(user._id.toString(), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, description: 'Tag updated successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateTagSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.tagService.update(user._id.toString(), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 200, description: 'Tag deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
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
    await this.tagService.delete(user._id.toString(), id);
    return { message: 'Tag deleted successfully' };
  }

  @Post('sync/:storeId')
  @ApiOperation({ summary: 'Sync tags from WooCommerce' })
  @ApiResponse({ status: 200, description: 'Tags synced successfully' })
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
    return await this.tagService.syncFromWooCommerce(user._id.toString(), storeId);
  }
}
