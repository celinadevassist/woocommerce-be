import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomFieldsetService } from './service';
import {
  CreateCustomFieldsetDto,
  CreateCustomFieldsetSchema,
  UpdateCustomFieldsetDto,
  UpdateCustomFieldsetSchema,
  QueryCustomFieldsetDto,
  QueryCustomFieldsetSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Custom Fieldset')
@ApiBearerAuth()
@Controller(':lang/custom-fieldset')
@UseGuards(AuthGuard('jwt'))
export class CustomFieldsetController {
  constructor(private readonly fieldsetService: CustomFieldsetService) {}

  @Post(':storeId')
  @ApiOperation({ summary: 'Create a new custom fieldset' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateCustomFieldsetSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async create(
    @Param('storeId') storeId: string,
    @Body() dto: CreateCustomFieldsetDto,
    @User() user: any,
  ) {
    return this.fieldsetService.create(user._id.toString(), storeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all custom fieldsets for a store' })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryCustomFieldsetSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async findAll(@Query() query: QueryCustomFieldsetDto, @User() user: any) {
    return this.fieldsetService.findAll(user._id.toString(), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a custom fieldset by ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async findById(@Param('id') id: string, @User() user: any) {
    return this.fieldsetService.findById(user._id.toString(), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a custom fieldset' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateCustomFieldsetSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldsetDto,
    @User() user: any,
  ) {
    return this.fieldsetService.update(user._id.toString(), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom fieldset' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async delete(@Param('id') id: string, @User() user: any) {
    return this.fieldsetService.delete(user._id.toString(), id);
  }

  @Post('sync-all/:storeId')
  @ApiOperation({ summary: 'Sync all active fieldsets for a store to WooCommerce' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async syncAllToWoo(@Param('storeId') storeId: string, @User() user: any) {
    return this.fieldsetService.syncAllToWoo(user._id.toString(), storeId);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Sync a single fieldset to WooCommerce' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async syncToWoo(@Param('id') id: string, @User() user: any) {
    return this.fieldsetService.syncToWoo(user._id.toString(), id);
  }
}
