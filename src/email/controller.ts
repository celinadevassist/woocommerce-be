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
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { EmailService } from './service';
import { User } from '../decorators/user.decorator';
import { EmailStatus } from './schema';

@ApiTags('Emails')
@ApiBearerAuth()
@Controller(':lang/emails')
@UseGuards(AuthGuard('jwt'))
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('store/:storeId')
  @ApiOperation({ summary: 'Get all emails for a store' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiQuery({ name: 'verified', required: false, type: Boolean })
  @ApiQuery({ name: 'marketingOptIn', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: EmailStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getStoreEmails(
    @Param('storeId') storeId: string,
    @Query('verified') verified?: string,
    @Query('marketingOptIn') marketingOptIn?: string,
    @Query('status') status?: EmailStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailService.getStoreEmails(storeId, {
      verified: verified !== undefined ? verified === 'true' : undefined,
      marketingOptIn: marketingOptIn !== undefined ? marketingOptIn === 'true' : undefined,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('store/:storeId/stats')
  @ApiOperation({ summary: 'Get email stats for a store' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  async getStats(@Param('storeId') storeId: string) {
    return this.emailService.getStats(storeId);
  }

  @Get('store/:storeId/campaign')
  @ApiOperation({ summary: 'Get emails ready for marketing campaign (verified, opted-in, active)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  async getCampaignEmails(@Param('storeId') storeId: string) {
    return this.emailService.getCampaignEmails(storeId);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get all emails for a customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  async getCustomerEmails(@Param('customerId') customerId: string) {
    return this.emailService.getCustomerEmails(customerId);
  }

  @Get('lookup/:storeId/:email')
  @ApiOperation({ summary: 'Find customer by email address' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiParam({ name: 'email', description: 'Email address' })
  async findCustomerByEmail(
    @Param('storeId') storeId: string,
    @Param('email') email: string,
  ) {
    const customer = await this.emailService.findCustomerByEmail(storeId, decodeURIComponent(email));
    return { customer };
  }

  @Post()
  @ApiOperation({ summary: 'Add a new email' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  async addEmail(
    @Body() dto: {
      storeId: string;
      organizationId: string;
      email: string;
      customerId?: string;
      source?: string;
    },
  ) {
    return this.emailService.findOrCreate(
      dto.storeId,
      dto.organizationId,
      dto.email,
      dto.customerId,
      dto.source || 'manual',
    );
  }

  @Put(':id/verify')
  @ApiOperation({ summary: 'Verify an email address' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async verify(
    @Param('id') id: string,
    @User('_id') userId: string,
  ) {
    return this.emailService.verify(id, userId);
  }

  @Put(':id/unverify')
  @ApiOperation({ summary: 'Unverify an email address' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async unverify(@Param('id') id: string) {
    return this.emailService.unverify(id);
  }

  @Put(':id/opt-out')
  @ApiOperation({ summary: 'Opt out of marketing emails' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async optOut(@Param('id') id: string) {
    return this.emailService.optOutMarketing(id);
  }

  @Put(':id/opt-in')
  @ApiOperation({ summary: 'Opt back into marketing emails' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async optIn(@Param('id') id: string) {
    return this.emailService.optInMarketing(id);
  }

  @Put(':id/unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe from all emails' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async unsubscribe(@Param('id') id: string) {
    return this.emailService.unsubscribe(id);
  }

  @Put(':id/block')
  @ApiOperation({ summary: 'Block an email address' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async block(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.emailService.block(id, dto.reason);
  }

  @Put(':id/invalid')
  @ApiOperation({ summary: 'Mark email as invalid (bounced)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async markInvalid(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.emailService.markInvalid(id, dto.reason);
  }

  @Put(':id/transfer')
  @ApiOperation({ summary: 'Transfer email to different customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async transfer(
    @Param('id') id: string,
    @Body() dto: { customerId: string; reason?: string },
  ) {
    return this.emailService.transferToCustomer(id, dto.customerId, dto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an email' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Email ID' })
  async delete(@Param('id') id: string) {
    await this.emailService.delete(id);
    return { message: 'Email deleted' };
  }
}
