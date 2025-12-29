import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
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
   * Get subscription for a specific store
   */
  @Get()
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get subscription for a store' })
  async getSubscription(@Query('storeId') storeId: string) {
    const subscription = await this.subscriptionService.getByStoreId(storeId);
    return { subscription };
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
   * Get all invoices for a store
   */
  @Get()
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Get all invoices for a store' })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'status', required: false, enum: InvoiceStatus })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getInvoices(
    @Query('storeId') storeId: string,
    @Query('status') status?: InvoiceStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.subscriptionService.getInvoicesByStore(
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

  /**
   * Initiate payment for an invoice
   * Creates a Ziina payment intent and returns the payment URL
   */
  @Post(':invoiceId/initiate-payment')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Initiate payment for invoice' })
  async initiatePayment(@Param('invoiceId') invoiceId: string) {
    const result = await this.subscriptionService.initiatePayment(invoiceId);
    return {
      success: true,
      paymentUrl: result.paymentUrl,
      paymentIntentId: result.paymentIntentId,
      expiresAt: result.expiresAt,
      message: 'Redirect to paymentUrl to complete payment',
    };
  }

  /**
   * Check payment status for an invoice
   */
  @Get(':invoiceId/payment-status')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Check payment status for invoice' })
  async checkPaymentStatus(@Param('invoiceId') invoiceId: string) {
    const status = await this.subscriptionService.checkPaymentStatus(invoiceId);
    return status;
  }

  /**
   * Verify and update payment status for an invoice
   * Manually triggers a check with Ziina and updates invoice if paid
   */
  @Post(':invoiceId/verify-payment')
  @SkipSubscriptionCheck()
  @ApiOperation({ summary: 'Verify payment status with payment provider and update invoice' })
  async verifyPayment(@Param('invoiceId') invoiceId: string) {
    const result = await this.subscriptionService.verifySingleInvoicePayment(invoiceId);
    return {
      success: true,
      updated: result.updated,
      paymentStatus: result.paymentStatus,
      invoiceStatus: result.invoice.status,
      message: result.updated
        ? 'Payment verified and invoice marked as paid'
        : `Payment status: ${result.paymentStatus}`,
    };
  }
}

/**
 * Webhook Controller for Ziina Payment Callbacks
 * This controller handles webhooks from Ziina when payment status changes
 */
@ApiTags('Payment Webhooks')
@Controller('webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Handle Ziina webhook events
   * Endpoint: POST /api/webhooks/ziina
   */
  @Post('ziina')
  async handleZiinaWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-ziina-signature') signature: string,
    @Body() payload: any,
  ) {
    this.logger.log('Received Ziina webhook');
    this.logger.debug('Payload:', JSON.stringify(payload, null, 2));

    try {
      // Verify webhook signature
      if (signature) {
        const isValid = this.subscriptionService.verifyWebhookSignature(payload, signature);
        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          return res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Invalid signature' });
        }
      }

      // Process webhook event
      const eventType = payload.type || payload.event_type;
      const paymentIntent = payload.data?.object || payload.data;

      this.logger.log(`Processing webhook event: ${eventType}`);

      switch (eventType) {
        case 'payment_intent.succeeded':
        case 'payment.succeeded':
          await this.subscriptionService.processPaymentSuccess(
            paymentIntent.id,
            paymentIntent.metadata || {},
          );
          break;

        case 'payment_intent.failed':
        case 'payment.failed':
          await this.subscriptionService.processPaymentFailure(
            paymentIntent.id,
            paymentIntent.latest_error?.message || 'Payment failed',
          );
          break;

        case 'payment_intent.canceled':
        case 'payment.canceled':
          await this.subscriptionService.processPaymentFailure(
            paymentIntent.id,
            'Payment was cancelled',
          );
          break;

        default:
          this.logger.log(`Unhandled webhook event type: ${eventType}`);
      }

      return res.status(HttpStatus.OK).json({ received: true });
    } catch (error) {
      this.logger.error('Webhook processing error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Webhook processing failed' });
    }
  }
}
