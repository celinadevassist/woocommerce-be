import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import {
  WooCommerceCredentials,
  WooProduct,
  WooProductVariation,
  WooOrder,
  WooCustomer,
  WooProductReview,
  WooStoreInfo,
  WooSettingsGeneral,
  WooProductUpdatePayload,
  WooStockUpdatePayload,
  WooVariationUpdatePayload,
  WooPaginatedResponse,
  WooCategoryFull,
  WooCategoryCreate,
  WooCategoryUpdate,
  WooProductAttribute,
  WooProductAttributeCreate,
  WooProductAttributeUpdate,
  WooAttributeTerm,
  WooAttributeTermCreate,
  WooAttributeTermUpdate,
  WooTagFull,
  WooTagCreate,
  WooTagUpdate,
  WooShippingZone,
  WooShippingZoneCreate,
  WooShippingZoneUpdate,
  WooShippingZoneLocation,
  WooShippingZoneMethod,
  WooShippingZoneMethodCreate,
  WooShippingZoneMethodUpdate,
  WooShippingMethod,
} from './woocommerce.types';
import {
  IPlatformAdapter,
  IConnectionTestResult,
  IPaginatedResult,
} from './platform-adapter.interface';

@Injectable()
export class WooCommerceService implements IPlatformAdapter {
  private readonly logger = new Logger(WooCommerceService.name);
  private readonly apiVersion = 'wc/v3';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Test connection to WooCommerce store
   */
  async testConnection(
    credentials: WooCommerceCredentials,
  ): Promise<IConnectionTestResult> {
    try {
      // Test basic connection
      const storeInfo = await this.getStoreInfo(credentials);

      // Get store settings for currency and timezone
      const settings = await this.getStoreSettings(credentials);
      const currencySetting = settings.find(
        (s) => s.id === 'woocommerce_currency',
      );
      const timezoneSetting = settings.find(
        (s) => s.id === 'woocommerce_timezone_string',
      );

      return {
        success: true,
        message: 'Connection successful',
        storeInfo: {
          name: storeInfo.name,
          url: storeInfo.url,
          version: storeInfo.wc_version || storeInfo.version,
          currency: currencySetting?.value || 'USD',
          timezone: timezoneSetting?.value || 'UTC',
        },
      };
    } catch (error) {
      this.logger.error(`WooCommerce connection test failed: ${error.message}`);
      return {
        success: false,
        message: this.parseErrorMessage(error),
      };
    }
  }

  /**
   * Get store information
   */
  async getStoreInfo(
    credentials: WooCommerceCredentials,
  ): Promise<WooStoreInfo> {
    const response = await this.request<WooStoreInfo>(credentials, 'GET', '');
    return response;
  }

  /**
   * Get store settings
   */
  async getStoreSettings(
    credentials: WooCommerceCredentials,
  ): Promise<WooSettingsGeneral[]> {
    const response = await this.request<WooSettingsGeneral[]>(
      credentials,
      'GET',
      'settings/general',
    );
    return response;
  }

  /**
   * Get products with pagination
   * @param modifiedAfter - ISO8601 date string to fetch only products modified after this date (delta sync)
   */
  async getProducts(
    credentials: WooCommerceCredentials,
    page = 1,
    perPage = 100,
    modifiedAfter?: string,
  ): Promise<IPaginatedResult<WooProduct>> {
    const params: Record<string, any> = {
      page,
      per_page: perPage,
    };

    // Add modified_after for delta sync
    if (modifiedAfter) {
      params.modified_after = modifiedAfter;
      this.logger.log(
        `[WooCommerce] DELTA SYNC - Fetching products modified after: ${modifiedAfter}`,
      );
    } else {
      this.logger.log(`[WooCommerce] FULL SYNC - Fetching all products`);
    }

    this.logger.log(
      `[WooCommerce] GET products API params: ${JSON.stringify(params)}`,
    );

    const response = await this.requestWithHeaders<WooProduct[]>(
      credentials,
      'GET',
      'products',
      params,
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get a single product
   */
  async getProduct(
    credentials: WooCommerceCredentials,
    productId: number,
  ): Promise<WooProduct> {
    return this.request<WooProduct>(
      credentials,
      'GET',
      `products/${productId}`,
    );
  }

  /**
   * Get product variations
   */
  async getProductVariations(
    credentials: WooCommerceCredentials,
    productId: number,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooProductVariation>> {
    const response = await this.requestWithHeaders<WooProductVariation[]>(
      credentials,
      'GET',
      `products/${productId}/variations`,
      { page, per_page: perPage },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Update a product
   */
  async updateProduct(
    credentials: WooCommerceCredentials,
    productId: number,
    data: WooProductUpdatePayload,
  ): Promise<WooProduct> {
    return this.request<WooProduct>(
      credentials,
      'PUT',
      `products/${productId}`,
      undefined,
      data,
    );
  }

  /**
   * Create a new product in WooCommerce
   */
  async createProduct(
    credentials: WooCommerceCredentials,
    data: any,
  ): Promise<WooProduct> {
    return this.request<WooProduct>(
      credentials,
      'POST',
      'products',
      undefined,
      data,
    );
  }

  /**
   * Delete a product from WooCommerce
   */
  async deleteProduct(
    credentials: WooCommerceCredentials,
    productId: number,
    force: boolean = true,
  ): Promise<WooProduct> {
    return this.request<WooProduct>(
      credentials,
      'DELETE',
      `products/${productId}`,
      { force },
    );
  }

  /**
   * Update product stock
   */
  async updateStock(
    credentials: WooCommerceCredentials,
    productId: number,
    quantity: number,
  ): Promise<WooProduct> {
    const payload: WooStockUpdatePayload = {
      stock_quantity: quantity,
      manage_stock: true,
    };
    return this.request<WooProduct>(
      credentials,
      'PUT',
      `products/${productId}`,
      undefined,
      payload,
    );
  }

  /**
   * Update variation stock
   */
  async updateVariationStock(
    credentials: WooCommerceCredentials,
    productId: number,
    variationId: number,
    quantity: number,
  ): Promise<WooProductVariation> {
    const payload: WooStockUpdatePayload = {
      stock_quantity: quantity,
      manage_stock: true,
    };
    return this.request<WooProductVariation>(
      credentials,
      'PUT',
      `products/${productId}/variations/${variationId}`,
      undefined,
      payload,
    );
  }

  /**
   * Update a variation
   */
  async updateVariation(
    credentials: WooCommerceCredentials,
    productId: number,
    variationId: number,
    data: WooVariationUpdatePayload,
  ): Promise<WooProductVariation> {
    return this.request<WooProductVariation>(
      credentials,
      'PUT',
      `products/${productId}/variations/${variationId}`,
      undefined,
      data,
    );
  }

  /**
   * Create a variation for a variable product
   */
  async createVariation(
    credentials: WooCommerceCredentials,
    productId: number,
    data: {
      regular_price?: string;
      sale_price?: string;
      sku?: string;
      stock_quantity?: number;
      stock_status?: string;
      manage_stock?: boolean;
      attributes: Array<{ id?: number; name: string; option: string }>;
      image?: { id?: number; src?: string };
    },
  ): Promise<WooProductVariation> {
    return this.request<WooProductVariation>(
      credentials,
      'POST',
      `products/${productId}/variations`,
      undefined,
      data,
    );
  }

  /**
   * Batch create variations for a variable product
   */
  async batchCreateVariations(
    credentials: WooCommerceCredentials,
    productId: number,
    variations: Array<{
      regular_price?: string;
      sku?: string;
      stock_status?: string;
      manage_stock?: boolean;
      attributes: Array<{ name: string; option: string }>;
    }>,
  ): Promise<{ create: WooProductVariation[] }> {
    return this.request<{ create: WooProductVariation[] }>(
      credentials,
      'POST',
      `products/${productId}/variations/batch`,
      undefined,
      { create: variations },
    );
  }

  /**
   * Delete a variation from a variable product
   */
  async deleteVariation(
    credentials: WooCommerceCredentials,
    productId: number,
    variationId: number,
    force = true,
  ): Promise<WooProductVariation> {
    return this.request<WooProductVariation>(
      credentials,
      'DELETE',
      `products/${productId}/variations/${variationId}`,
      { force },
    );
  }

  /**
   * Get orders with pagination
   * @param modifiedAfter - ISO8601 date string to fetch only orders modified after this date (delta sync)
   */
  async getOrders(
    credentials: WooCommerceCredentials,
    page = 1,
    perPage = 100,
    status?: string,
    modifiedAfter?: string,
  ): Promise<IPaginatedResult<WooOrder>> {
    const params: any = { page, per_page: perPage };
    if (status) params.status = status;

    // Add modified_after for delta sync
    if (modifiedAfter) {
      params.modified_after = modifiedAfter;
      this.logger.log(
        `[WooCommerce] DELTA SYNC - Fetching orders modified after: ${modifiedAfter}`,
      );
    } else {
      this.logger.log(`[WooCommerce] FULL SYNC - Fetching all orders`);
    }

    this.logger.log(
      `[WooCommerce] GET orders API params: ${JSON.stringify(params)}`,
    );

    const response = await this.requestWithHeaders<WooOrder[]>(
      credentials,
      'GET',
      'orders',
      params,
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get a single order
   */
  async getOrder(
    credentials: WooCommerceCredentials,
    orderId: number,
  ): Promise<WooOrder> {
    return this.request<WooOrder>(credentials, 'GET', `orders/${orderId}`);
  }

  /**
   * Update an order (status, notes, etc.)
   */
  async updateOrder(
    credentials: WooCommerceCredentials,
    orderId: number,
    data: { status?: string; customer_note?: string },
  ): Promise<WooOrder> {
    return this.request<WooOrder>(
      credentials,
      'PUT',
      `orders/${orderId}`,
      undefined,
      data,
    );
  }

  /**
   * Get customers with pagination
   */
  async getCustomers(
    credentials: WooCommerceCredentials,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooCustomer>> {
    const response = await this.requestWithHeaders<WooCustomer[]>(
      credentials,
      'GET',
      'customers',
      { page, per_page: perPage },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get product reviews with pagination
   */
  async getReviews(
    credentials: WooCommerceCredentials,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooProductReview>> {
    const response = await this.requestWithHeaders<WooProductReview[]>(
      credentials,
      'GET',
      'products/reviews',
      { page, per_page: perPage },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get reviews for a specific product
   */
  async getProductReviews(
    credentials: WooCommerceCredentials,
    productId: number,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooProductReview>> {
    const response = await this.requestWithHeaders<WooProductReview[]>(
      credentials,
      'GET',
      'products/reviews',
      { page, per_page: perPage, product: productId },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Update a product review (status, etc.)
   */
  async updateReview(
    credentials: WooCommerceCredentials,
    reviewId: number,
    data: { status?: string },
  ): Promise<WooProductReview> {
    return this.request<WooProductReview>(
      credentials,
      'PUT',
      `products/reviews/${reviewId}`,
      undefined,
      data,
    );
  }

  /**
   * Create a refund for an order
   */
  async createRefund(
    credentials: WooCommerceCredentials,
    orderId: number,
    data: { amount: string; reason?: string; api_refund?: boolean },
  ): Promise<{
    id: number;
    reason: string;
    total: string;
    date_created: string;
  }> {
    return this.request(
      credentials,
      'POST',
      `orders/${orderId}/refunds`,
      undefined,
      data,
    );
  }

  /**
   * Get refunds for an order
   */
  async getRefunds(
    credentials: WooCommerceCredentials,
    orderId: number,
  ): Promise<
    Array<{ id: number; reason: string; total: string; date_created: string }>
  > {
    return this.request(credentials, 'GET', `orders/${orderId}/refunds`);
  }

  // ==================== CATEGORIES ====================

  /**
   * Get all categories with pagination
   */
  async getCategories(
    credentials: WooCommerceCredentials,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooCategoryFull>> {
    const response = await this.requestWithHeaders<WooCategoryFull[]>(
      credentials,
      'GET',
      'products/categories',
      { page, per_page: perPage },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get a single category
   */
  async getCategory(
    credentials: WooCommerceCredentials,
    categoryId: number,
  ): Promise<WooCategoryFull> {
    return this.request<WooCategoryFull>(
      credentials,
      'GET',
      `products/categories/${categoryId}`,
    );
  }

  /**
   * Create a category
   */
  async createCategory(
    credentials: WooCommerceCredentials,
    data: WooCategoryCreate,
  ): Promise<WooCategoryFull> {
    return this.request<WooCategoryFull>(
      credentials,
      'POST',
      'products/categories',
      undefined,
      data,
    );
  }

  /**
   * Update a category
   */
  async updateCategory(
    credentials: WooCommerceCredentials,
    categoryId: number,
    data: WooCategoryUpdate,
  ): Promise<WooCategoryFull> {
    return this.request<WooCategoryFull>(
      credentials,
      'PUT',
      `products/categories/${categoryId}`,
      undefined,
      data,
    );
  }

  /**
   * Delete a category
   */
  async deleteCategory(
    credentials: WooCommerceCredentials,
    categoryId: number,
    force = true,
  ): Promise<WooCategoryFull> {
    return this.request<WooCategoryFull>(
      credentials,
      'DELETE',
      `products/categories/${categoryId}`,
      { force },
    );
  }

  // ==================== PRODUCT ATTRIBUTES ====================

  /**
   * Get all product attributes
   */
  async getAttributes(
    credentials: WooCommerceCredentials,
  ): Promise<WooProductAttribute[]> {
    return this.request<WooProductAttribute[]>(
      credentials,
      'GET',
      'products/attributes',
    );
  }

  /**
   * Get a single attribute
   */
  async getAttribute(
    credentials: WooCommerceCredentials,
    attributeId: number,
  ): Promise<WooProductAttribute> {
    return this.request<WooProductAttribute>(
      credentials,
      'GET',
      `products/attributes/${attributeId}`,
    );
  }

  /**
   * Create an attribute
   */
  async createAttribute(
    credentials: WooCommerceCredentials,
    data: WooProductAttributeCreate,
  ): Promise<WooProductAttribute> {
    return this.request<WooProductAttribute>(
      credentials,
      'POST',
      'products/attributes',
      undefined,
      data,
    );
  }

  /**
   * Update an attribute
   */
  async updateAttribute(
    credentials: WooCommerceCredentials,
    attributeId: number,
    data: WooProductAttributeUpdate,
  ): Promise<WooProductAttribute> {
    return this.request<WooProductAttribute>(
      credentials,
      'PUT',
      `products/attributes/${attributeId}`,
      undefined,
      data,
    );
  }

  /**
   * Delete an attribute
   */
  async deleteAttribute(
    credentials: WooCommerceCredentials,
    attributeId: number,
    force = true,
  ): Promise<WooProductAttribute> {
    return this.request<WooProductAttribute>(
      credentials,
      'DELETE',
      `products/attributes/${attributeId}`,
      { force },
    );
  }

  // ==================== ATTRIBUTE TERMS ====================

  /**
   * Get all terms for an attribute
   */
  async getAttributeTerms(
    credentials: WooCommerceCredentials,
    attributeId: number,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooAttributeTerm>> {
    const response = await this.requestWithHeaders<WooAttributeTerm[]>(
      credentials,
      'GET',
      `products/attributes/${attributeId}/terms`,
      { page, per_page: perPage },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get a single term
   */
  async getAttributeTerm(
    credentials: WooCommerceCredentials,
    attributeId: number,
    termId: number,
  ): Promise<WooAttributeTerm> {
    return this.request<WooAttributeTerm>(
      credentials,
      'GET',
      `products/attributes/${attributeId}/terms/${termId}`,
    );
  }

  /**
   * Create a term
   */
  async createAttributeTerm(
    credentials: WooCommerceCredentials,
    attributeId: number,
    data: WooAttributeTermCreate,
  ): Promise<WooAttributeTerm> {
    return this.request<WooAttributeTerm>(
      credentials,
      'POST',
      `products/attributes/${attributeId}/terms`,
      undefined,
      data,
    );
  }

  /**
   * Update a term
   */
  async updateAttributeTerm(
    credentials: WooCommerceCredentials,
    attributeId: number,
    termId: number,
    data: WooAttributeTermUpdate,
  ): Promise<WooAttributeTerm> {
    return this.request<WooAttributeTerm>(
      credentials,
      'PUT',
      `products/attributes/${attributeId}/terms/${termId}`,
      undefined,
      data,
    );
  }

  /**
   * Delete a term
   */
  async deleteAttributeTerm(
    credentials: WooCommerceCredentials,
    attributeId: number,
    termId: number,
    force = true,
  ): Promise<WooAttributeTerm> {
    return this.request<WooAttributeTerm>(
      credentials,
      'DELETE',
      `products/attributes/${attributeId}/terms/${termId}`,
      { force },
    );
  }

  // ==================== PRODUCT TAGS ====================

  /**
   * Get all tags with pagination
   */
  async getTags(
    credentials: WooCommerceCredentials,
    page = 1,
    perPage = 100,
  ): Promise<IPaginatedResult<WooTagFull>> {
    const response = await this.requestWithHeaders<WooTagFull[]>(
      credentials,
      'GET',
      'products/tags',
      { page, per_page: perPage },
    );

    return {
      data: response.data,
      totalItems: parseInt(response.headers['x-wp-total'] || '0', 10),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
      currentPage: page,
    };
  }

  /**
   * Get a single tag
   */
  async getTag(
    credentials: WooCommerceCredentials,
    tagId: number,
  ): Promise<WooTagFull> {
    return this.request<WooTagFull>(
      credentials,
      'GET',
      `products/tags/${tagId}`,
    );
  }

  /**
   * Create a tag
   */
  async createTag(
    credentials: WooCommerceCredentials,
    data: WooTagCreate,
  ): Promise<WooTagFull> {
    return this.request<WooTagFull>(
      credentials,
      'POST',
      'products/tags',
      undefined,
      data,
    );
  }

  /**
   * Update a tag
   */
  async updateTag(
    credentials: WooCommerceCredentials,
    tagId: number,
    data: WooTagUpdate,
  ): Promise<WooTagFull> {
    return this.request<WooTagFull>(
      credentials,
      'PUT',
      `products/tags/${tagId}`,
      undefined,
      data,
    );
  }

  /**
   * Delete a tag
   */
  async deleteTag(
    credentials: WooCommerceCredentials,
    tagId: number,
    force = true,
  ): Promise<WooTagFull> {
    return this.request<WooTagFull>(
      credentials,
      'DELETE',
      `products/tags/${tagId}`,
      { force },
    );
  }

  /**
   * Delete a media item from WordPress Media Library
   * Uses WordPress REST API (wp/v2) instead of WooCommerce API
   */
  async deleteMedia(
    credentials: WooCommerceCredentials,
    mediaId: number,
    force = true,
  ): Promise<any> {
    // WordPress REST API requires WordPress credentials (username + application password)
    // These are different from WooCommerce API credentials
    if (!credentials.wpUsername || !credentials.wpAppPassword) {
      this.logger.warn(
        `Cannot delete WordPress media ID ${mediaId}: WordPress credentials not configured. ` +
          `To enable media deletion, configure wpUsername and wpAppPassword in store settings.`,
      );
      return null;
    }

    const baseUrl = credentials.url.replace(/\/+$/, '');
    const url = `${baseUrl}/wp-json/wp/v2/media/${mediaId}`;

    const config: AxiosRequestConfig = {
      method: 'DELETE',
      url,
      params: { force },
      auth: {
        username: credentials.wpUsername,
        password: credentials.wpAppPassword,
      },
    };

    try {
      this.logger.log(`Deleting WordPress media ID: ${mediaId}`);
      const response = await firstValueFrom(this.httpService.request(config));
      this.logger.log(`Successfully deleted WordPress media ID: ${mediaId}`);
      return response.data;
    } catch (error) {
      const statusCode = error.response?.status;
      if (statusCode === 401) {
        this.logger.warn(
          `Failed to delete WordPress media ID ${mediaId}: Authentication failed. ` +
            `Please verify WordPress credentials (wpUsername and wpAppPassword).`,
        );
      } else if (statusCode === 404) {
        this.logger.warn(
          `WordPress media ID ${mediaId} not found (may already be deleted).`,
        );
      } else {
        this.logger.warn(
          `Failed to delete WordPress media ID ${mediaId}: ${error.message}`,
        );
      }
      // Don't throw - we don't want to fail the entire operation if media deletion fails
      return null;
    }
  }

  // Private helper methods
  private buildApiUrl(
    credentials: WooCommerceCredentials,
    endpoint: string,
  ): string {
    const baseUrl = credentials.url.replace(/\/+$/, '');
    return `${baseUrl}/wp-json/${this.apiVersion}/${endpoint}`;
  }

  private getAuthConfig(
    credentials: WooCommerceCredentials,
  ): AxiosRequestConfig {
    return {
      auth: {
        username: credentials.consumerKey,
        password: credentials.consumerSecret,
      },
      timeout: 60000, // 60 second timeout for slow WooCommerce stores
    };
  }

  private async request<T>(
    credentials: WooCommerceCredentials,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params?: Record<string, any>,
    data?: any,
  ): Promise<T> {
    const url = this.buildApiUrl(credentials, endpoint);
    const config: AxiosRequestConfig = {
      ...this.getAuthConfig(credentials),
      method,
      url,
      params,
      data,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>(config),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `WooCommerce API error: ${method} ${endpoint}`,
        error.message,
      );
      throw error;
    }
  }

  private async requestWithHeaders<T>(
    credentials: WooCommerceCredentials,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params?: Record<string, any>,
    data?: any,
  ): Promise<{ data: T; headers: Record<string, string> }> {
    const url = this.buildApiUrl(credentials, endpoint);
    const config: AxiosRequestConfig = {
      ...this.getAuthConfig(credentials),
      method,
      url,
      params,
      data,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>(config),
      );
      return {
        data: response.data,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      this.logger.error(
        `WooCommerce API error: ${method} ${endpoint}`,
        error.message,
      );
      throw error;
    }
  }

  private parseErrorMessage(error: any): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.code) {
      switch (error.response.data.code) {
        case 'woocommerce_rest_authentication_error':
          return 'Invalid API credentials. Please check your Consumer Key and Secret.';
        case 'woocommerce_rest_cannot_view':
          return 'Insufficient permissions. Please ensure API has read/write access.';
        default:
          return `API Error: ${error.response.data.code}`;
      }
    }
    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused. Please check the store URL.';
    }
    if (error.code === 'ENOTFOUND') {
      return 'Store URL not found. Please verify the URL is correct.';
    }
    if (error.code === 'ETIMEDOUT') {
      return 'Connection timed out. Please try again.';
    }
    return error.message || 'Unknown error occurred';
  }

  // ============== SHIPPING ZONES ==============

  /**
   * Get all shipping zones
   */
  async getShippingZones(
    credentials: WooCommerceCredentials,
  ): Promise<WooShippingZone[]> {
    return this.request<WooShippingZone[]>(
      credentials,
      'GET',
      'shipping/zones',
    );
  }

  /**
   * Get a single shipping zone
   */
  async getShippingZone(
    credentials: WooCommerceCredentials,
    zoneId: number,
  ): Promise<WooShippingZone> {
    return this.request<WooShippingZone>(
      credentials,
      'GET',
      `shipping/zones/${zoneId}`,
    );
  }

  /**
   * Create a shipping zone
   */
  async createShippingZone(
    credentials: WooCommerceCredentials,
    data: WooShippingZoneCreate,
  ): Promise<WooShippingZone> {
    return this.request<WooShippingZone>(
      credentials,
      'POST',
      'shipping/zones',
      undefined,
      data,
    );
  }

  /**
   * Update a shipping zone
   */
  async updateShippingZone(
    credentials: WooCommerceCredentials,
    zoneId: number,
    data: WooShippingZoneUpdate,
  ): Promise<WooShippingZone> {
    return this.request<WooShippingZone>(
      credentials,
      'PUT',
      `shipping/zones/${zoneId}`,
      undefined,
      data,
    );
  }

  /**
   * Delete a shipping zone
   */
  async deleteShippingZone(
    credentials: WooCommerceCredentials,
    zoneId: number,
    force = true,
  ): Promise<WooShippingZone> {
    return this.request<WooShippingZone>(
      credentials,
      'DELETE',
      `shipping/zones/${zoneId}`,
      { force },
    );
  }

  // ============== SHIPPING ZONE LOCATIONS ==============

  /**
   * Get locations for a shipping zone
   */
  async getShippingZoneLocations(
    credentials: WooCommerceCredentials,
    zoneId: number,
  ): Promise<WooShippingZoneLocation[]> {
    return this.request<WooShippingZoneLocation[]>(
      credentials,
      'GET',
      `shipping/zones/${zoneId}/locations`,
    );
  }

  /**
   * Update locations for a shipping zone (replaces all locations)
   */
  async updateShippingZoneLocations(
    credentials: WooCommerceCredentials,
    zoneId: number,
    locations: WooShippingZoneLocation[],
  ): Promise<WooShippingZoneLocation[]> {
    return this.request<WooShippingZoneLocation[]>(
      credentials,
      'PUT',
      `shipping/zones/${zoneId}/locations`,
      undefined,
      locations,
    );
  }

  // ============== SHIPPING ZONE METHODS ==============

  /**
   * Get methods for a shipping zone
   */
  async getShippingZoneMethods(
    credentials: WooCommerceCredentials,
    zoneId: number,
  ): Promise<WooShippingZoneMethod[]> {
    return this.request<WooShippingZoneMethod[]>(
      credentials,
      'GET',
      `shipping/zones/${zoneId}/methods`,
    );
  }

  /**
   * Get a single method from a shipping zone
   */
  async getShippingZoneMethod(
    credentials: WooCommerceCredentials,
    zoneId: number,
    instanceId: number,
  ): Promise<WooShippingZoneMethod> {
    return this.request<WooShippingZoneMethod>(
      credentials,
      'GET',
      `shipping/zones/${zoneId}/methods/${instanceId}`,
    );
  }

  /**
   * Add a method to a shipping zone
   */
  async createShippingZoneMethod(
    credentials: WooCommerceCredentials,
    zoneId: number,
    data: WooShippingZoneMethodCreate,
  ): Promise<WooShippingZoneMethod> {
    return this.request<WooShippingZoneMethod>(
      credentials,
      'POST',
      `shipping/zones/${zoneId}/methods`,
      undefined,
      data,
    );
  }

  /**
   * Update a method in a shipping zone
   */
  async updateShippingZoneMethod(
    credentials: WooCommerceCredentials,
    zoneId: number,
    instanceId: number,
    data: WooShippingZoneMethodUpdate,
  ): Promise<WooShippingZoneMethod> {
    return this.request<WooShippingZoneMethod>(
      credentials,
      'PUT',
      `shipping/zones/${zoneId}/methods/${instanceId}`,
      undefined,
      data,
    );
  }

  /**
   * Delete a method from a shipping zone
   */
  async deleteShippingZoneMethod(
    credentials: WooCommerceCredentials,
    zoneId: number,
    instanceId: number,
    force = true,
  ): Promise<WooShippingZoneMethod> {
    return this.request<WooShippingZoneMethod>(
      credentials,
      'DELETE',
      `shipping/zones/${zoneId}/methods/${instanceId}`,
      { force },
    );
  }

  // ============== SHIPPING METHODS (Available Types) ==============

  /**
   * Get all available shipping method types
   */
  async getShippingMethods(
    credentials: WooCommerceCredentials,
  ): Promise<WooShippingMethod[]> {
    return this.request<WooShippingMethod[]>(
      credentials,
      'GET',
      'shipping_methods',
    );
  }

  /**
   * Get a single shipping method type
   */
  async getShippingMethod(
    credentials: WooCommerceCredentials,
    methodId: string,
  ): Promise<WooShippingMethod> {
    return this.request<WooShippingMethod>(
      credentials,
      'GET',
      `shipping_methods/${methodId}`,
    );
  }

  // ============== ORDERS BATCH ==============

  /**
   * Batch create, update, and delete orders
   * Uses WooCommerce batch endpoint: POST /orders/batch
   */
  async batchOrders(
    credentials: WooCommerceCredentials,
    batch: {
      create?: Array<{
        payment_method?: string;
        payment_method_title?: string;
        set_paid?: boolean;
        billing?: {
          first_name?: string;
          last_name?: string;
          company?: string;
          address_1?: string;
          address_2?: string;
          city?: string;
          state?: string;
          postcode?: string;
          country?: string;
          email?: string;
          phone?: string;
        };
        shipping?: {
          first_name?: string;
          last_name?: string;
          company?: string;
          address_1?: string;
          address_2?: string;
          city?: string;
          state?: string;
          postcode?: string;
          country?: string;
        };
        line_items?: Array<{
          product_id?: number;
          variation_id?: number;
          quantity?: number;
          price?: string;
        }>;
        shipping_lines?: Array<{
          method_id?: string;
          method_title?: string;
          total?: string;
        }>;
        fee_lines?: Array<{
          name?: string;
          total?: string;
        }>;
        coupon_lines?: Array<{
          code?: string;
        }>;
        customer_id?: number;
        customer_note?: string;
        status?: string;
        meta_data?: Array<{ key: string; value: string }>;
      }>;
      update?: Array<{
        id: number;
        status?: string;
        billing?: any;
        shipping?: any;
        line_items?: any[];
        shipping_lines?: any[];
        fee_lines?: any[];
        coupon_lines?: any[];
        customer_note?: string;
        meta_data?: Array<{ key: string; value: string }>;
      }>;
      delete?: number[];
    },
  ): Promise<{
    create?: WooOrder[];
    update?: WooOrder[];
    delete?: WooOrder[];
  }> {
    this.logger.log(
      `[WooCommerce] BATCH orders: create=${
        batch.create?.length || 0
      }, update=${batch.update?.length || 0}, delete=${
        batch.delete?.length || 0
      }`,
    );
    return this.request(credentials, 'POST', 'orders/batch', undefined, batch);
  }

  /**
   * Create a new order in WooCommerce
   */
  async createOrder(
    credentials: WooCommerceCredentials,
    data: {
      payment_method?: string;
      payment_method_title?: string;
      set_paid?: boolean;
      billing?: {
        first_name?: string;
        last_name?: string;
        company?: string;
        address_1?: string;
        address_2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
        email?: string;
        phone?: string;
      };
      shipping?: {
        first_name?: string;
        last_name?: string;
        company?: string;
        address_1?: string;
        address_2?: string;
        city?: string;
        state?: string;
        postcode?: string;
        country?: string;
      };
      line_items?: Array<{
        product_id?: number;
        variation_id?: number;
        quantity?: number;
        price?: string;
      }>;
      shipping_lines?: Array<{
        method_id?: string;
        method_title?: string;
        total?: string;
      }>;
      fee_lines?: Array<{
        name?: string;
        total?: string;
      }>;
      coupon_lines?: Array<{
        code?: string;
      }>;
      customer_id?: number;
      customer_note?: string;
      status?: string;
      meta_data?: Array<{ key: string; value: string }>;
    },
  ): Promise<WooOrder> {
    return this.request<WooOrder>(
      credentials,
      'POST',
      'orders',
      undefined,
      data,
    );
  }

  /**
   * Delete an order from WooCommerce
   */
  async deleteOrder(
    credentials: WooCommerceCredentials,
    orderId: number,
    force = false,
  ): Promise<WooOrder> {
    return this.request<WooOrder>(credentials, 'DELETE', `orders/${orderId}`, {
      force,
    });
  }

  // ============== DATA (Countries/States) ==============

  /**
   * Get all countries with their states
   */
  async getCountries(credentials: WooCommerceCredentials): Promise<any[]> {
    return this.request<any[]>(credentials, 'GET', 'data/countries');
  }

  /**
   * Get a single country with its states
   */
  async getCountry(
    credentials: WooCommerceCredentials,
    countryCode: string,
  ): Promise<any> {
    return this.request<any>(
      credentials,
      'GET',
      `data/countries/${countryCode}`,
    );
  }

  // ============== CARTFLOW CUSTOM LOCATIONS (via WordPress Plugin) ==============

  /**
   * Build URL for CartFlow Locations plugin API
   */
  private buildCartFlowApiUrl(
    credentials: WooCommerceCredentials,
    endpoint: string,
  ): string {
    const baseUrl = credentials.url.replace(/\/+$/, '');
    return `${baseUrl}/wp-json/cartflow/v1/${endpoint}`;
  }

  /**
   * Make request to CartFlow Locations plugin
   */
  private async cartflowRequest<T>(
    credentials: WooCommerceCredentials,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
  ): Promise<T> {
    const url = this.buildCartFlowApiUrl(credentials, endpoint);
    const config: AxiosRequestConfig = {
      ...this.getAuthConfig(credentials),
      method,
      url,
      data,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>(config),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `CartFlow Locations API error: ${method} ${endpoint}`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get all custom states from CartFlow Locations plugin
   */
  async getCustomStates(
    credentials: WooCommerceCredentials,
  ): Promise<Record<string, Record<string, string>>> {
    return this.cartflowRequest<Record<string, Record<string, string>>>(
      credentials,
      'GET',
      'locations/states',
    );
  }

  /**
   * Add a custom state via CartFlow Locations plugin
   */
  async addCustomState(
    credentials: WooCommerceCredentials,
    countryCode: string,
    stateCode: string,
    stateName: string,
  ): Promise<{ success: boolean; message: string; state: any }> {
    return this.cartflowRequest(credentials, 'POST', 'locations/states', {
      country_code: countryCode,
      state_code: stateCode,
      state_name: stateName,
    });
  }

  /**
   * Update a custom state via CartFlow Locations plugin
   */
  async updateCustomState(
    credentials: WooCommerceCredentials,
    countryCode: string,
    stateCode: string,
    stateName: string,
  ): Promise<{ success: boolean; message: string; state: any }> {
    return this.cartflowRequest(
      credentials,
      'PUT',
      `locations/states/${countryCode}/${stateCode}`,
      { state_name: stateName },
    );
  }

  /**
   * Delete a custom state via CartFlow Locations plugin
   */
  async deleteCustomState(
    credentials: WooCommerceCredentials,
    countryCode: string,
    stateCode: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.cartflowRequest(
      credentials,
      'DELETE',
      `locations/states/${countryCode}/${stateCode}`,
    );
  }

  /**
   * Bulk update states for a country via CartFlow Locations plugin
   */
  async bulkUpdateStates(
    credentials: WooCommerceCredentials,
    countryCode: string,
    states: Array<{ code: string; name: string; groups?: string[] }>,
    groups?: Array<{ name: string; color?: string; description?: string }>,
  ): Promise<{
    success: boolean;
    message: string;
    states: Record<string, string>;
    groups_synced?: number;
  }> {
    return this.cartflowRequest(
      credentials,
      'POST',
      `locations/states/${countryCode}/bulk`,
      { states, groups },
    );
  }

  /**
   * Get all countries with states (including custom) from CartFlow Locations plugin
   */
  async getCountriesWithCustomStates(
    credentials: WooCommerceCredentials,
  ): Promise<any[]> {
    return this.cartflowRequest<any[]>(
      credentials,
      'GET',
      'locations/countries',
    );
  }
}
