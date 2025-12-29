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
  async testConnection(credentials: WooCommerceCredentials): Promise<IConnectionTestResult> {
    try {
      // Test basic connection
      const storeInfo = await this.getStoreInfo(credentials);

      // Get store settings for currency and timezone
      const settings = await this.getStoreSettings(credentials);
      const currencySetting = settings.find((s) => s.id === 'woocommerce_currency');
      const timezoneSetting = settings.find((s) => s.id === 'woocommerce_timezone_string');

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
  async getStoreInfo(credentials: WooCommerceCredentials): Promise<WooStoreInfo> {
    const response = await this.request<WooStoreInfo>(credentials, 'GET', '');
    return response;
  }

  /**
   * Get store settings
   */
  async getStoreSettings(credentials: WooCommerceCredentials): Promise<WooSettingsGeneral[]> {
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
    page: number = 1,
    perPage: number = 100,
    modifiedAfter?: string,
  ): Promise<IPaginatedResult<WooProduct>> {
    const params: Record<string, any> = {
      page,
      per_page: perPage,
    };

    // Add modified_after for delta sync
    if (modifiedAfter) {
      params.modified_after = modifiedAfter;
    }

    const response = await this.requestWithHeaders<WooProduct[]>(credentials, 'GET', 'products', params);

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
    return this.request<WooProduct>(credentials, 'GET', `products/${productId}`);
  }

  /**
   * Get product variations
   */
  async getProductVariations(
    credentials: WooCommerceCredentials,
    productId: number,
    page: number = 1,
    perPage: number = 100,
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
    return this.request<WooProduct>(credentials, 'PUT', `products/${productId}`, undefined, data);
  }

  /**
   * Create a new product in WooCommerce
   */
  async createProduct(
    credentials: WooCommerceCredentials,
    data: any,
  ): Promise<WooProduct> {
    return this.request<WooProduct>(credentials, 'POST', 'products', undefined, data);
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
    return this.request<WooProduct>(credentials, 'PUT', `products/${productId}`, undefined, payload);
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
   * Get orders with pagination
   * @param modifiedAfter - ISO8601 date string to fetch only orders modified after this date (delta sync)
   */
  async getOrders(
    credentials: WooCommerceCredentials,
    page: number = 1,
    perPage: number = 100,
    status?: string,
    modifiedAfter?: string,
  ): Promise<IPaginatedResult<WooOrder>> {
    const params: any = { page, per_page: perPage };
    if (status) params.status = status;

    // Add modified_after for delta sync
    if (modifiedAfter) {
      params.modified_after = modifiedAfter;
    }

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
  async getOrder(credentials: WooCommerceCredentials, orderId: number): Promise<WooOrder> {
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
    return this.request<WooOrder>(credentials, 'PUT', `orders/${orderId}`, undefined, data);
  }

  /**
   * Get customers with pagination
   */
  async getCustomers(
    credentials: WooCommerceCredentials,
    page: number = 1,
    perPage: number = 100,
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
    page: number = 1,
    perPage: number = 100,
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
    page: number = 1,
    perPage: number = 100,
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
  ): Promise<{ id: number; reason: string; total: string; date_created: string }> {
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
  ): Promise<Array<{ id: number; reason: string; total: string; date_created: string }>> {
    return this.request(
      credentials,
      'GET',
      `orders/${orderId}/refunds`,
    );
  }

  // ==================== CATEGORIES ====================

  /**
   * Get all categories with pagination
   */
  async getCategories(
    credentials: WooCommerceCredentials,
    page: number = 1,
    perPage: number = 100,
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
    return this.request<WooCategoryFull>(credentials, 'GET', `products/categories/${categoryId}`);
  }

  /**
   * Create a category
   */
  async createCategory(
    credentials: WooCommerceCredentials,
    data: WooCategoryCreate,
  ): Promise<WooCategoryFull> {
    return this.request<WooCategoryFull>(credentials, 'POST', 'products/categories', undefined, data);
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
    force: boolean = true,
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
    return this.request<WooProductAttribute[]>(credentials, 'GET', 'products/attributes');
  }

  /**
   * Get a single attribute
   */
  async getAttribute(
    credentials: WooCommerceCredentials,
    attributeId: number,
  ): Promise<WooProductAttribute> {
    return this.request<WooProductAttribute>(credentials, 'GET', `products/attributes/${attributeId}`);
  }

  /**
   * Create an attribute
   */
  async createAttribute(
    credentials: WooCommerceCredentials,
    data: WooProductAttributeCreate,
  ): Promise<WooProductAttribute> {
    return this.request<WooProductAttribute>(credentials, 'POST', 'products/attributes', undefined, data);
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
    force: boolean = true,
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
    page: number = 1,
    perPage: number = 100,
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
    force: boolean = true,
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
    page: number = 1,
    perPage: number = 100,
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
    return this.request<WooTagFull>(credentials, 'GET', `products/tags/${tagId}`);
  }

  /**
   * Create a tag
   */
  async createTag(
    credentials: WooCommerceCredentials,
    data: WooTagCreate,
  ): Promise<WooTagFull> {
    return this.request<WooTagFull>(credentials, 'POST', 'products/tags', undefined, data);
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
    force: boolean = true,
  ): Promise<WooTagFull> {
    return this.request<WooTagFull>(
      credentials,
      'DELETE',
      `products/tags/${tagId}`,
      { force },
    );
  }

  // Private helper methods
  private buildApiUrl(credentials: WooCommerceCredentials, endpoint: string): string {
    const baseUrl = credentials.url.replace(/\/+$/, '');
    return `${baseUrl}/wp-json/${this.apiVersion}/${endpoint}`;
  }

  private getAuthConfig(credentials: WooCommerceCredentials): AxiosRequestConfig {
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
      const response = await firstValueFrom(this.httpService.request<T>(config));
      return response.data;
    } catch (error) {
      this.logger.error(`WooCommerce API error: ${method} ${endpoint}`, error.message);
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
      const response = await firstValueFrom(this.httpService.request<T>(config));
      return {
        data: response.data,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      this.logger.error(`WooCommerce API error: ${method} ${endpoint}`, error.message);
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
}
