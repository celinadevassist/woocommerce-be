import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Store, StoreDocument } from '../store/schema';
import { OrderService } from '../order/service';
import { ProductService } from '../product/service';
import { CustomerService } from '../customer/service';
import { ReviewService } from '../review/service';
import { WooOrder, WooProduct, WooCustomer, WooProductReview } from '../integrations/woocommerce/woocommerce.types';

export interface WebhookPayload {
  topic: string;
  resource: string;
  event: string;
  data: any;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly orderService: OrderService,
    private readonly productService: ProductService,
    private readonly customerService: CustomerService,
    private readonly reviewService: ReviewService,
  ) {}

  /**
   * Verify webhook signature from WooCommerce
   */
  async verifySignature(storeId: string, signature: string, rawBody: string): Promise<StoreDocument> {
    const store = await this.storeModel.findById(storeId);
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (!store.webhookSecret) {
      this.logger.warn(`Webhook secret not configured for store ${storeId}`);
      // Allow for development, but log warning
      return store;
    }

    // WooCommerce uses HMAC-SHA256 for webhook signatures
    const expectedSignature = crypto
      .createHmac('sha256', store.webhookSecret)
      .update(rawBody)
      .digest('base64');

    if (signature !== expectedSignature) {
      this.logger.error(`Invalid webhook signature for store ${storeId}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return store;
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(
    store: StoreDocument,
    topic: string,
    payload: any,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Processing webhook: ${topic} for store ${store.name}`);

    try {
      // Parse topic (format: "resource.event", e.g., "order.created")
      const [resource, event] = topic.split('.');

      switch (resource) {
        case 'order':
          return await this.handleOrderWebhook(store, event, payload);
        case 'product':
          return await this.handleProductWebhook(store, event, payload);
        case 'customer':
          return await this.handleCustomerWebhook(store, event, payload);
        case 'review':
          return await this.handleReviewWebhook(store, event, payload);
        default:
          this.logger.warn(`Unhandled webhook resource: ${resource}`);
          return { success: true, message: `Ignored webhook: ${topic}` };
      }
    } catch (error) {
      this.logger.error(`Webhook processing error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle order webhooks
   */
  private async handleOrderWebhook(
    store: StoreDocument,
    event: string,
    payload: WooOrder,
  ): Promise<{ success: boolean; message: string }> {
    const storeId = store._id.toString();
    const organizationId = store.organizationId.toString();

    switch (event) {
      case 'created':
      case 'updated':
        await this.orderService.upsertFromWoo(storeId, organizationId, payload);
        return { success: true, message: `Order ${payload.id} ${event}` };

      case 'deleted':
        // Mark as deleted in local DB (soft delete)
        this.logger.log(`Order ${payload.id} deleted notification received`);
        return { success: true, message: `Order ${payload.id} deletion noted` };

      case 'restored':
        await this.orderService.upsertFromWoo(storeId, organizationId, payload);
        return { success: true, message: `Order ${payload.id} restored` };

      default:
        this.logger.warn(`Unhandled order event: ${event}`);
        return { success: true, message: `Ignored order event: ${event}` };
    }
  }

  /**
   * Handle product webhooks
   */
  private async handleProductWebhook(
    store: StoreDocument,
    event: string,
    payload: WooProduct,
  ): Promise<{ success: boolean; message: string }> {
    const storeId = store._id.toString();
    const organizationId = store.organizationId.toString();

    switch (event) {
      case 'created':
      case 'updated':
        await this.productService.upsertFromWoo(storeId, organizationId, payload);
        return { success: true, message: `Product ${payload.id} ${event}` };

      case 'deleted':
        // Handle product deletion (mark as deleted)
        this.logger.log(`Product ${payload.id} deleted notification received`);
        return { success: true, message: `Product ${payload.id} deletion noted` };

      case 'restored':
        await this.productService.upsertFromWoo(storeId, organizationId, payload);
        return { success: true, message: `Product ${payload.id} restored` };

      default:
        this.logger.warn(`Unhandled product event: ${event}`);
        return { success: true, message: `Ignored product event: ${event}` };
    }
  }

  /**
   * Handle customer webhooks
   */
  private async handleCustomerWebhook(
    store: StoreDocument,
    event: string,
    payload: WooCustomer,
  ): Promise<{ success: boolean; message: string }> {
    const storeId = store._id.toString();
    const organizationId = store.organizationId.toString();

    switch (event) {
      case 'created':
      case 'updated':
        await this.customerService.upsertFromWoo(storeId, organizationId, payload);
        return { success: true, message: `Customer ${payload.id} ${event}` };

      case 'deleted':
        this.logger.log(`Customer ${payload.id} deleted notification received`);
        return { success: true, message: `Customer ${payload.id} deletion noted` };

      default:
        this.logger.warn(`Unhandled customer event: ${event}`);
        return { success: true, message: `Ignored customer event: ${event}` };
    }
  }

  /**
   * Handle review webhooks
   */
  private async handleReviewWebhook(
    store: StoreDocument,
    event: string,
    payload: WooProductReview,
  ): Promise<{ success: boolean; message: string }> {
    const storeId = store._id.toString();
    const organizationId = store.organizationId.toString();

    switch (event) {
      case 'created':
      case 'updated':
        await this.reviewService.upsertFromWoo(storeId, organizationId, payload);
        return { success: true, message: `Review ${payload.id} ${event}` };

      case 'deleted':
        this.logger.log(`Review ${payload.id} deleted notification received`);
        return { success: true, message: `Review ${payload.id} deletion noted` };

      default:
        this.logger.warn(`Unhandled review event: ${event}`);
        return { success: true, message: `Ignored review event: ${event}` };
    }
  }

  /**
   * Generate a webhook secret for a store
   */
  generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get webhook URL for a store
   */
  getWebhookUrl(storeId: string, baseUrl: string): string {
    return `${baseUrl}/api/webhooks/woocommerce/${storeId}`;
  }
}
