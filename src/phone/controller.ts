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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PhoneService } from './service';
import { User } from '../decorators/user.decorator';
import { PhoneStatus } from './schema';

@ApiTags('Phones')
@ApiBearerAuth()
@Controller(':lang/phones')
@UseGuards(AuthGuard('jwt'))
export class PhoneController {
  constructor(private readonly phoneService: PhoneService) {}

  @Get('store/:storeId')
  @ApiOperation({ summary: 'Get all phones for a store' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiQuery({ name: 'verified', required: false, type: Boolean })
  @ApiQuery({ name: 'smsOptIn', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: PhoneStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getStorePhones(
    @Param('storeId') storeId: string,
    @Query('verified') verified?: string,
    @Query('smsOptIn') smsOptIn?: string,
    @Query('status') status?: PhoneStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.phoneService.getStorePhones(storeId, {
      verified: verified !== undefined ? verified === 'true' : undefined,
      smsOptIn: smsOptIn !== undefined ? smsOptIn === 'true' : undefined,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('store/:storeId/stats')
  @ApiOperation({ summary: 'Get phone stats for a store' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  async getStats(@Param('storeId') storeId: string) {
    return this.phoneService.getStats(storeId);
  }

  @Get('store/:storeId/campaign')
  @ApiOperation({
    summary: 'Get phones ready for SMS campaign (verified, opted-in, active)',
  })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  async getCampaignPhones(@Param('storeId') storeId: string) {
    return this.phoneService.getCampaignPhones(storeId);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get all phones for a customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  async getCustomerPhones(@Param('customerId') customerId: string) {
    return this.phoneService.getCustomerPhones(customerId);
  }

  @Get('lookup/:storeId/:phone')
  @ApiOperation({ summary: 'Find customer by phone number' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiParam({ name: 'phone', description: 'Phone number' })
  async findCustomerByPhone(
    @Param('storeId') storeId: string,
    @Param('phone') phone: string,
  ) {
    const customer = await this.phoneService.findCustomerByPhone(
      storeId,
      decodeURIComponent(phone),
    );
    return { customer };
  }

  @Post()
  @ApiOperation({ summary: 'Add a new phone' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  async addPhone(
    @Body()
    dto: {
      storeId: string;
      phone: string;
      customerId?: string;
      source?: string;
    },
  ) {
    return this.phoneService.findOrCreate(
      dto.storeId,
      dto.phone,
      dto.customerId,
      dto.source || 'manual',
    );
  }

  @Put(':id/verify')
  @ApiOperation({ summary: 'Verify a phone number' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async verify(@Param('id') id: string, @User('_id') userId: string) {
    return this.phoneService.verify(id, userId);
  }

  @Put(':id/unverify')
  @ApiOperation({ summary: 'Unverify a phone number' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async unverify(@Param('id') id: string) {
    return this.phoneService.unverify(id);
  }

  @Put(':id/opt-out')
  @ApiOperation({ summary: 'Opt out of SMS' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async optOut(@Param('id') id: string) {
    return this.phoneService.optOut(id);
  }

  @Put(':id/opt-in')
  @ApiOperation({ summary: 'Opt back into SMS' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async optIn(@Param('id') id: string) {
    return this.phoneService.optIn(id);
  }

  @Put(':id/block')
  @ApiOperation({ summary: 'Block a phone number' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async block(@Param('id') id: string, @Body() dto: { reason?: string }) {
    return this.phoneService.block(id, dto.reason);
  }

  @Put(':id/invalid')
  @ApiOperation({ summary: 'Mark phone as invalid' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async markInvalid(@Param('id') id: string) {
    return this.phoneService.markInvalid(id);
  }

  @Put(':id/transfer')
  @ApiOperation({ summary: 'Transfer phone to different customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async transfer(
    @Param('id') id: string,
    @Body() dto: { customerId: string; reason?: string },
  ) {
    return this.phoneService.transferToCustomer(id, dto.customerId, dto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a phone' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Phone ID' })
  async delete(@Param('id') id: string) {
    await this.phoneService.delete(id);
    return { message: 'Phone deleted' };
  }
}
