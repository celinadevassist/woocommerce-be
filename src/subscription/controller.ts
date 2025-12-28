import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SubscriptionService } from './service';
import { SkipSubscriptionCheck } from './guard';
import { InvoiceStatus } from './schema';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller(':lang/subscriptions')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Get all subscriptions for the user's organization
   */
  @Get()
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get all subscriptions for organization' })
  async getSubscriptions(@User() user: UserDocument, @Query('organizationId') organizationId: string) {
    const subscriptions = await this.subscriptionService.getByOrganizationId(organizationId);
    return { subscriptions };
  }

  /**
   * Get subscription for a specific store
   */
  @Get('store/:storeId')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get subscription for a store' })
  async getStoreSubscription(@Param('storeId') storeId: string) {
    const subscription = await this.subscriptionService.getByStoreId(storeId);
    return { subscription };
  }

  /**
   * Check if a store is active (subscription valid)
   */
  @Get('store/:storeId/status')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Check if store subscription is active' })
  async checkStoreStatus(@Param('storeId') storeId: string) {
    const status = await this.subscriptionService.isStoreActive(storeId);
    return status;
  }

  /**
   * Get subscription stats (admin only)
   */
  @Get('stats')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get subscription statistics' })
  async getStats() {
    const stats = await this.subscriptionService.getSubscriptionStats();
    return stats;
  }
}

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller(':lang/invoices')
@UseGuards(AuthGuard('jwt'))
export class InvoiceController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Get all invoices for the user's organization
   */
  @Get()
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get all invoices for organization' })
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getInvoices(
    @User() user: UserDocument,
    @Query('organizationId') organizationId: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.subscriptionService.getInvoicesByOrganization(
      organizationId,
      storeId,
      status,
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
    return result;
  }

  /**
   * Get invoice by ID
   */
  @Get(':invoiceId')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get invoice by ID' })
  async getInvoice(@Param('invoiceId') invoiceId: string) {
    const invoice = await this.subscriptionService.getInvoiceById(invoiceId);
    return { invoice };
  }

  /**
   * Get pending invoices for a store
   */
  @Get('store/:storeId/pending')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get pending invoices for a store' })
  async getPendingInvoices(@Param('storeId') storeId: string) {
    const invoices = await this.subscriptionService.getPendingInvoices(storeId);
    return { invoices };
  }

  /**
   * Mark invoice as paid (admin or payment callback)
   */
  @Patch(':invoiceId/pay')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Mark invoice as paid' })
  async markPaid(
    @Param('invoiceId') invoiceId: string,
    @Body() body: { paymentMethod?: string; paymentReference?: string },
  ) {
    const invoice = await this.subscriptionService.markInvoicePaid(
      invoiceId,
      body.paymentMethod,
      body.paymentReference,
    );
    return { invoice, message: 'Invoice marked as paid' };
  }
}
