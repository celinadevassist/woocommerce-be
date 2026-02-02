import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { StoreSettingsService } from './service';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Store Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/store-settings')
export class StoreSettingsController {
  constructor(private readonly storeSettingsService: StoreSettingsService) {}

  // ============== PLUGIN STATUS ==============

  @Get('plugin-status')
  @ApiOperation({ summary: 'Check if CartFlow Bridge plugin is installed' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async checkPluginStatus(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.checkPluginStatus(
      storeId,
      user._id.toString(),
    );
  }

  @Get('plugin-info')
  @ApiOperation({ summary: 'Get CartFlow Bridge plugin info and version' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getPluginInfo(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getPluginInfo(
      storeId,
      user._id.toString(),
    );
  }

  // ============== SHIPPING FEATURES ==============

  @Get('features/shipping')
  @ApiOperation({ summary: 'Get shipping features settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getShippingFeatures(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getShippingFeatures(
      storeId,
      user._id.toString(),
    );
  }

  @Post('features/shipping')
  @ApiOperation({ summary: 'Update shipping features settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async updateShippingFeatures(
    @Query('storeId') storeId: string,
    @Body() data: { hide_when_free_available: boolean },
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.updateShippingFeatures(
      storeId,
      user._id.toString(),
      data,
    );
  }

  // ============== CURRENCY CONVERSION FEATURES ==============

  @Get('features/currency')
  @ApiOperation({ summary: 'Get currency conversion feature settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getCurrencyFeatures(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getCurrencyFeatures(
      storeId,
      user._id.toString(),
    );
  }

  @Post('features/currency')
  @ApiOperation({ summary: 'Update currency conversion feature settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async updateCurrencyFeatures(
    @Query('storeId') storeId: string,
    @Body() data: any,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.updateCurrencyFeatures(
      storeId,
      user._id.toString(),
      data,
    );
  }

  @Get('features/currency/live-rate')
  @ApiOperation({ summary: 'Get live exchange rate for currency conversion' })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'base', required: false })
  @ApiQuery({ name: 'target', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getLiveExchangeRate(
    @Query('storeId') storeId: string,
    @Query('base') base: string,
    @Query('target') target: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getLiveExchangeRate(
      storeId,
      user._id.toString(),
      base,
      target,
    );
  }

  // ============== GENERAL SETTINGS ==============

  @Get('general')
  @ApiOperation({ summary: 'Get WordPress general settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getGeneralSettings(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getGeneralSettings(
      storeId,
      user._id.toString(),
    );
  }

  @Post('general')
  @ApiOperation({ summary: 'Update WordPress general settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async updateGeneralSettings(
    @Query('storeId') storeId: string,
    @Body() data: Record<string, any>,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.updateGeneralSettings(
      storeId,
      user._id.toString(),
      data,
    );
  }

  // ============== READING SETTINGS ==============

  @Get('reading')
  @ApiOperation({ summary: 'Get WordPress reading settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getReadingSettings(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getReadingSettings(
      storeId,
      user._id.toString(),
    );
  }

  @Post('reading')
  @ApiOperation({ summary: 'Update WordPress reading settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async updateReadingSettings(
    @Query('storeId') storeId: string,
    @Body() data: Record<string, any>,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.updateReadingSettings(
      storeId,
      user._id.toString(),
      data,
    );
  }

  // ============== WOOCOMMERCE SETTINGS ==============

  @Get('woocommerce')
  @ApiOperation({ summary: 'Get WooCommerce settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getWooCommerceSettings(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getWooCommerceSettings(
      storeId,
      user._id.toString(),
    );
  }

  @Post('woocommerce')
  @ApiOperation({ summary: 'Update WooCommerce settings' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async updateWooCommerceSettings(
    @Query('storeId') storeId: string,
    @Body() data: Record<string, any>,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.updateWooCommerceSettings(
      storeId,
      user._id.toString(),
      data,
    );
  }

  // ============== SYSTEM INFO ==============

  @Get('system')
  @ApiOperation({
    summary: 'Get system info (WordPress, WooCommerce versions)',
  })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getSystemInfo(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.storeSettingsService.getSystemInfo(
      storeId,
      user._id.toString(),
    );
  }
}
