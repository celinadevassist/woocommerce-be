import {
  Controller,
  Post,
  Param,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { WebhookService } from './service';
import { Request } from 'express';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * WooCommerce webhook endpoint
   * Receives webhooks for orders, products, customers, and reviews
   */
  @Post('woocommerce/:storeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WooCommerce webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid webhook' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWooCommerceWebhook(
    @Param('storeId') storeId: string,
    @Headers('x-wc-webhook-signature') signature: string,
    @Headers('x-wc-webhook-topic') topic: string,
    @Headers('x-wc-webhook-resource') resource: string,
    @Headers('x-wc-webhook-event') event: string,
    @Headers('x-wc-webhook-delivery-id') deliveryId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Received webhook: ${topic} for store ${storeId}, delivery: ${deliveryId}`);

    // Get raw body for signature verification
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!topic) {
      // This might be a ping/test from WooCommerce
      if (req.body && Object.keys(req.body).length === 0) {
        return { success: true, message: 'Webhook endpoint active' };
      }
      throw new BadRequestException('Missing webhook topic');
    }

    try {
      // Verify signature and get store
      const store = await this.webhookService.verifySignature(storeId, signature, rawBody);

      // Process the webhook
      const result = await this.webhookService.processWebhook(store, topic, req.body);

      this.logger.log(`Webhook processed successfully: ${topic}`);
      return result;
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Health check endpoint for webhooks
   */
  @Post('woocommerce/:storeId/ping')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async ping(@Param('storeId') storeId: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: `Webhook endpoint active for store ${storeId}` };
  }
}
