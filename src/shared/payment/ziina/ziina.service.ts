import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface IPaymentIntent {
  id: string;
  account_id: string;
  amount: number;
  tip_amount: number;
  fee_amount: number;
  currency_code: string;
  created_at: string;
  status: 'requires_payment_instrument' | 'requires_user_action' | 'pending' | 'completed' | 'failed' | 'canceled';
  operation_id: string;
  message?: string;
  redirect_url?: string;
  success_url?: string;
  cancel_url?: string;
  failure_url?: string;
  latest_error?: {
    message: string;
    code: string;
  };
  allow_tips?: boolean;
}

export interface ICreatePaymentIntentRequest {
  amount: number;
  currency_code: string;
  message?: string;
  success_url?: string;
  cancel_url?: string;
  failure_url?: string;
  test?: boolean;
  transaction_source?: 'directApi' | 'graphqlApi' | 'shopify' | 'woocommerce' | 'wix' | 'pos';
  expiry?: string;
  allow_tips?: boolean;
  metadata?: Record<string, any>;
}

export interface IPaymentLink {
  id: string;
  url: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, any>;
}

export interface IRefund {
  id: string;
  payment: string;
  amount: number;
  status: string;
  reason: string;
  metadata: Record<string, any>;
}

@Injectable()
export class ZiinaService {
  private readonly logger = new Logger(ZiinaService.name);
  private readonly axiosInstance: AxiosInstance;
  private accessToken: string;
  private tokenExpiresAt: Date;

  constructor(private configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: this.configService.get('ZIINA_API_URL', 'https://api-v2.ziina.com/api'),
      timeout: 30000,
    });

    // Add request interceptor to include auth token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.getValidToken();
        config.headers.Authorization = `Bearer ${token}`;
        config.headers['Content-Type'] = 'application/json';

        this.logger.log('Making Ziina API request:', {
          url: config.url,
          method: config.method,
          hasToken: !!token,
          tokenLength: token?.length
        });

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('='.repeat(80));
        this.logger.error('Ziina API Error Details:');
        this.logger.error(`URL: ${error.config?.url}`);
        this.logger.error(`Method: ${error.config?.method?.toUpperCase()}`);
        this.logger.error(`Status: ${error.response?.status}`);
        this.logger.error(`Status Text: ${error.response?.statusText}`);
        this.logger.error(`Response Data: ${JSON.stringify(error.response?.data, null, 2)}`);
        this.logger.error(`Error Message: ${error.message}`);
        this.logger.error(`Request Headers: ${JSON.stringify(error.config?.headers, null, 2)}`);
        this.logger.error(`Request Data: ${JSON.stringify(error.config?.data, null, 2)}`);
        this.logger.error('='.repeat(80));

        // Extract error message from Ziina response
        const ziinaMessage = error.response?.data?.message
          || error.response?.data?.error
          || error.response?.data?.error_description
          || error.message
          || 'Payment service error';

        throw new HttpException(
          {
            statusCode: error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
            message: `Ziina API Error: ${ziinaMessage}`,
            error: error.response?.statusText || 'Payment Service Error',
            details: error.response?.data
          },
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    );
  }

  private async getValidToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // Use static token from config
    this.accessToken = this.configService.get('ZIINA_ACCESS_TOKEN', '');
    this.tokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    return this.accessToken;
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    options: {
      message?: string;
      successUrl?: string;
      cancelUrl?: string;
      failureUrl?: string;
      test?: boolean;
      expiry?: string;
      allowTips?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<IPaymentIntent> {
    try {
      const request: ICreatePaymentIntentRequest = {
        amount: Math.round(amount * 100), // Convert to cents
        currency_code: currency,
        message: options.message,
        success_url: options.successUrl,
        cancel_url: options.cancelUrl,
        failure_url: options.failureUrl,
        test: options.test || false,
        transaction_source: 'directApi',
        expiry: options.expiry,
        allow_tips: options.allowTips || false,
        metadata: options.metadata
      };

      this.logger.log('Creating payment intent:', {
        amount: request.amount,
        currency: request.currency_code,
        test: request.test,
        apiUrl: this.configService.get('ZIINA_API_URL')
      });

      const response = await this.axiosInstance.post('/payment_intent', request);

      this.logger.log('Payment intent created:', {
        id: response.data.id,
        status: response.data.status,
        redirect_url: response.data.redirect_url
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create payment intent:', error);
      throw error;
    }
  }

  async createPaymentLink(
    invoiceId: string,
    amount: number,
    description: string,
    successUrl?: string,
    cancelUrl?: string
  ): Promise<IPaymentLink> {
    try {
      // Remove trailing slash from base URL
      const baseUrl = this.configService.get('APP_URL', 'http://localhost:3000').replace(/\/+$/, '');

      const response = await this.axiosInstance.post('/payment_links', {
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'USD',
        description,
        success_url: successUrl || `${baseUrl}/payments/success?invoice=${invoiceId}`,
        cancel_url: cancelUrl || `${baseUrl}/payments/cancel?invoice=${invoiceId}`,
        metadata: {
          invoiceId,
          type: 'invoice_payment',
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create payment link:', error);
      throw error;
    }
  }

  async confirmPayment(paymentIntentId: string): Promise<IPaymentIntent> {
    try {
      const response = await this.axiosInstance.post(
        `/payment_intents/${paymentIntentId}/confirm`
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to confirm payment:', error);
      throw error;
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
    reason: string = 'requested_by_customer'
  ): Promise<IRefund> {
    try {
      const data: any = {
        payment: paymentId,
        reason,
        metadata: {
          processed_at: new Date().toISOString(),
        },
      };

      if (amount) {
        data.amount = Math.round(amount * 100); // Partial refund in cents
      }

      const response = await this.axiosInstance.post('/refunds', data);

      return response.data;
    } catch (error) {
      this.logger.error('Failed to refund payment:', error);
      throw error;
    }
  }

  async getPaymentIntent(paymentIntentId: string): Promise<IPaymentIntent> {
    try {
      const response = await this.axiosInstance.get(`/payment_intent/${paymentIntentId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get payment intent:', error);
      throw error;
    }
  }

  async getPaymentLink(paymentLinkId: string): Promise<IPaymentLink> {
    try {
      const response = await this.axiosInstance.get(`/payment_links/${paymentLinkId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get payment link:', error);
      throw error;
    }
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    const webhookSecret = this.configService.get('ZIINA_WEBHOOK_SECRET', '');

    if (!webhookSecret) {
      this.logger.warn('Webhook secret not configured');
      return false;
    }

    // Ensure consistent JSON serialization
    const payloadString = JSON.stringify(payload);

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadString)
      .digest('hex');

    // Log for debugging (remove in production)
    this.logger.debug(`Webhook verification:`, {
      receivedSignature: signature,
      expectedSignature: expectedSignature,
      payloadLength: payloadString.length,
      secretLength: webhookSecret.length
    });

    // Handle both hex string comparison and buffer comparison
    try {
      // First try direct string comparison (case-insensitive for hex)
      if (signature.toLowerCase() === expectedSignature.toLowerCase()) {
        return true;
      }

      // If not equal as strings, try timing-safe buffer comparison
      return crypto.timingSafeEqual(
        new Uint8Array(Buffer.from(signature, 'hex')),
        new Uint8Array(Buffer.from(expectedSignature, 'hex'))
      );
    } catch (error) {
      this.logger.error('Error comparing signatures:', error);
      return false;
    }
  }

  /**
   * Verify payment status directly with Ziina API
   * @param paymentIntentId The payment intent ID to verify
   * @returns The payment intent object from Ziina
   */
  async verifyPaymentStatus(paymentIntentId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/payment_intent/${paymentIntentId}`
      );

      this.logger.log(`Verified payment status for ${paymentIntentId}: ${response.data.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to verify payment status for ${paymentIntentId}:`, error);
      throw new Error(`Failed to verify payment status: ${error.message}`);
    }
  }

  async handleWebhookEvent(event: any): Promise<void> {
    this.logger.log(`Processing webhook event: ${event.type}`);

    // According to Ziina v2 API, webhook events follow the format:
    // payment_intent.succeeded, payment_intent.failed, etc.
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.failed':
        await this.handlePaymentFailure(event.data.object);
        break;
      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(event.data.object);
        break;
      case 'refund.succeeded':
        await this.handleRefund(event.data.object);
        break;
      default:
        this.logger.warn(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handlePaymentSuccess(paymentIntent: any): Promise<void> {
    // This will be implemented by the payment service
    this.logger.log(`Payment succeeded: ${paymentIntent.id}`);
  }

  private async handlePaymentFailure(paymentIntent: any): Promise<void> {
    // This will be implemented by the payment service
    this.logger.log(`Payment failed: ${paymentIntent.id}`);
  }

  private async handlePaymentCanceled(paymentIntent: any): Promise<void> {
    // This will be implemented by the payment service
    this.logger.log(`Payment canceled: ${paymentIntent.id}`);
  }

  private async handleRefund(charge: any): Promise<void> {
    // This will be implemented by the payment service
    this.logger.log(`Refund processed: ${charge.id}`);
  }

  // Helper method to format amount for display
  formatAmount(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency,
    }).format(amount);
  }
}
