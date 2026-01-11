import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ShippingService } from './service';
import {
  CreateShippingZoneDto,
  CreateShippingZoneSchema,
  UpdateShippingZoneDto,
  UpdateShippingZoneSchema,
  UpdateShippingZoneLocationsDto,
  UpdateShippingZoneLocationsSchema,
  CreateShippingZoneMethodDto,
  CreateShippingZoneMethodSchema,
  UpdateShippingZoneMethodDto,
  UpdateShippingZoneMethodSchema,
  CreateCustomStateDto,
  CreateCustomStateSchema,
  UpdateCustomStateDto,
  UpdateCustomStateSchema,
  BulkUpdateStatesDto,
  BulkUpdateStatesSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Shipping')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  // ============== AVAILABLE SHIPPING METHODS ==============
  // NOTE: This must be defined BEFORE zones/:zoneId routes to avoid being caught by the param

  @Get('methods')
  @ApiOperation({ summary: 'Get available shipping method types' })
  @ApiResponse({ status: 200, description: 'Shipping methods retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getAvailableMethods(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getAvailableMethods(storeId, user._id.toString());
  }

  // ============== COUNTRIES & STATES ==============
  // NOTE: These must be defined BEFORE zones/:zoneId routes

  @Get('countries')
  @ApiOperation({ summary: 'Get all countries with their states from WooCommerce' })
  @ApiResponse({ status: 200, description: 'Countries retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getCountries(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getCountries(storeId, user._id.toString());
  }

  @Get('countries/:countryCode')
  @ApiOperation({ summary: 'Get states for a specific country' })
  @ApiResponse({ status: 200, description: 'Country states retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getCountryStates(
    @Param('countryCode') countryCode: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getCountryStates(storeId, user._id.toString(), countryCode);
  }

  // ============== SHIPPING ZONES ==============

  @Get('zones')
  @ApiOperation({ summary: 'Get all shipping zones with locations and methods' })
  @ApiResponse({ status: 200, description: 'Shipping zones retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getZones(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getZones(storeId, user._id.toString());
  }

  @Get('zones/:zoneId')
  @ApiOperation({ summary: 'Get a single shipping zone with details' })
  @ApiResponse({ status: 200, description: 'Shipping zone retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getZone(
    @Param('zoneId') zoneId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getZone(storeId, user._id.toString(), parseInt(zoneId, 10));
  }

  @Post('zones')
  @ApiOperation({ summary: 'Create a new shipping zone' })
  @ApiResponse({ status: 201, description: 'Shipping zone created successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateShippingZoneSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async createZone(
    @Body() dto: CreateShippingZoneDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.createZone(storeId, user._id.toString(), dto);
  }

  @Put('zones/:zoneId')
  @ApiOperation({ summary: 'Update a shipping zone' })
  @ApiResponse({ status: 200, description: 'Shipping zone updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateShippingZoneSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateZone(
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateShippingZoneDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.updateZone(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
      dto,
    );
  }

  @Delete('zones/:zoneId')
  @ApiOperation({ summary: 'Delete a shipping zone' })
  @ApiResponse({ status: 200, description: 'Shipping zone deleted successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async deleteZone(
    @Param('zoneId') zoneId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.shippingService.deleteZone(storeId, user._id.toString(), parseInt(zoneId, 10));
    return { success: true, message: 'Shipping zone deleted' };
  }

  // ============== SHIPPING ZONE LOCATIONS ==============

  @Get('zones/:zoneId/locations')
  @ApiOperation({ summary: 'Get locations for a shipping zone' })
  @ApiResponse({ status: 200, description: 'Zone locations retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getZoneLocations(
    @Param('zoneId') zoneId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getZoneLocations(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
    );
  }

  @Put('zones/:zoneId/locations')
  @ApiOperation({ summary: 'Update locations for a shipping zone (replaces all)' })
  @ApiResponse({ status: 200, description: 'Zone locations updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateShippingZoneLocationsSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateZoneLocations(
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateShippingZoneLocationsDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.updateZoneLocations(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
      dto,
    );
  }

  // ============== SHIPPING ZONE METHODS ==============

  @Get('zones/:zoneId/methods')
  @ApiOperation({ summary: 'Get methods for a shipping zone' })
  @ApiResponse({ status: 200, description: 'Zone methods retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getZoneMethods(
    @Param('zoneId') zoneId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getZoneMethods(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
    );
  }

  @Post('zones/:zoneId/methods')
  @ApiOperation({ summary: 'Add a shipping method to a zone' })
  @ApiResponse({ status: 201, description: 'Zone method added successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateShippingZoneMethodSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async createZoneMethod(
    @Param('zoneId') zoneId: string,
    @Body() dto: CreateShippingZoneMethodDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.createZoneMethod(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
      dto,
    );
  }

  @Put('zones/:zoneId/methods/:instanceId')
  @ApiOperation({ summary: 'Update a shipping method in a zone' })
  @ApiResponse({ status: 200, description: 'Zone method updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateShippingZoneMethodSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateZoneMethod(
    @Param('zoneId') zoneId: string,
    @Param('instanceId') instanceId: string,
    @Body() dto: UpdateShippingZoneMethodDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.updateZoneMethod(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
      parseInt(instanceId, 10),
      dto,
    );
  }

  @Delete('zones/:zoneId/methods/:instanceId')
  @ApiOperation({ summary: 'Remove a shipping method from a zone' })
  @ApiResponse({ status: 200, description: 'Zone method removed successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async deleteZoneMethod(
    @Param('zoneId') zoneId: string,
    @Param('instanceId') instanceId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.shippingService.deleteZoneMethod(
      storeId,
      user._id.toString(),
      parseInt(zoneId, 10),
      parseInt(instanceId, 10),
    );
    return { success: true, message: 'Zone method removed' };
  }

  // ============== CUSTOM LOCATIONS (via CartFlow Plugin) ==============

  @Get('custom-states')
  @ApiOperation({ summary: 'Get all custom states from CartFlow plugin' })
  @ApiResponse({ status: 200, description: 'Custom states retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getCustomStates(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getCustomStates(storeId, user._id.toString());
  }

  @Post('custom-states')
  @ApiOperation({ summary: 'Add a custom state via CartFlow plugin' })
  @ApiResponse({ status: 201, description: 'Custom state added successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateCustomStateSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async addCustomState(
    @Body() dto: CreateCustomStateDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.addCustomState(
      storeId,
      user._id.toString(),
      dto.countryCode,
      dto.stateCode,
      dto.stateName,
    );
  }

  @Put('custom-states/:countryCode/:stateCode')
  @ApiOperation({ summary: 'Update a custom state via CartFlow plugin' })
  @ApiResponse({ status: 200, description: 'Custom state updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateCustomStateSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateCustomState(
    @Param('countryCode') countryCode: string,
    @Param('stateCode') stateCode: string,
    @Body() dto: UpdateCustomStateDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.updateCustomState(
      storeId,
      user._id.toString(),
      countryCode,
      stateCode,
      dto.stateName,
    );
  }

  @Delete('custom-states/:countryCode/:stateCode')
  @ApiOperation({ summary: 'Delete a custom state via CartFlow plugin' })
  @ApiResponse({ status: 200, description: 'Custom state deleted successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async deleteCustomState(
    @Param('countryCode') countryCode: string,
    @Param('stateCode') stateCode: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.shippingService.deleteCustomState(
      storeId,
      user._id.toString(),
      countryCode,
      stateCode,
    );
    return { success: true, message: 'Custom state deleted' };
  }

  @Post('custom-states/:countryCode/bulk')
  @ApiOperation({ summary: 'Bulk update states for a country via CartFlow plugin' })
  @ApiResponse({ status: 200, description: 'States updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkUpdateStatesSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkUpdateStates(
    @Param('countryCode') countryCode: string,
    @Body() dto: BulkUpdateStatesDto,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.bulkUpdateStates(
      storeId,
      user._id.toString(),
      countryCode,
      dto.states,
    );
  }

  @Get('countries-with-custom')
  @ApiOperation({ summary: 'Get all countries with custom states (via CartFlow plugin)' })
  @ApiResponse({ status: 200, description: 'Countries retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getCountriesWithCustomStates(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.shippingService.getCountriesWithCustomStates(storeId, user._id.toString());
  }
}
