import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceCredentials } from '../integrations/woocommerce/woocommerce.types';

@Injectable()
export class StoreSettingsService {
  private readonly logger = new Logger(StoreSettingsService.name);
  private readonly pluginApiVersion = 'cartflow/v1';

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Get store and verify user access (includes credentials)
   */
  private async getStoreWithAccess(
    storeId: string,
    userId: string,
  ): Promise<StoreDocument> {
    // Include credentials since they're select: false by default
    const store = await this.storeModel
      .findById(storeId)
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Check if user is owner or a member
    const isOwner = store.ownerId?.toString() === userId;
    const isMember = store.members?.some(
      (m) =>
        m.userId?.toString() === userId &&
        ['admin', 'manager'].includes(m.role),
    );

    if (!isOwner && !isMember) {
      throw new ForbiddenException('Access denied to this store');
    }

    return store;
  }

  /**
   * Get WooCommerce credentials from store
   */
  private getCredentials(store: StoreDocument): WooCommerceCredentials {
    if (!store.credentials) {
      throw new NotFoundException(
        'Store credentials not found. Please reconnect the store.',
      );
    }
    return {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };
  }

  /**
   * Build API URL for CartFlow Bridge plugin
   */
  private buildPluginApiUrl(
    credentials: WooCommerceCredentials,
    endpoint: string,
  ): string {
    const baseUrl = credentials.url.replace(/\/+$/, '');
    return `${baseUrl}/wp-json/${this.pluginApiVersion}/${endpoint}`;
  }

  /**
   * Get auth config for WooCommerce API
   */
  private getAuthConfig(
    credentials: WooCommerceCredentials,
  ): AxiosRequestConfig {
    return {
      auth: {
        username: credentials.consumerKey,
        password: credentials.consumerSecret,
      },
      timeout: 30000,
    };
  }

  /**
   * Make request to CartFlow Bridge plugin
   */
  private async pluginRequest<T>(
    credentials: WooCommerceCredentials,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
  ): Promise<T> {
    const url = this.buildPluginApiUrl(credentials, endpoint);
    const config: AxiosRequestConfig = {
      ...this.getAuthConfig(credentials),
      method,
      url,
      data,
    };

    try {
      this.logger.log(`[StoreSettings] ${method} ${url}`);
      this.logger.log(`[StoreSettings] Store URL: ${credentials.url}`);
      this.logger.log(
        `[StoreSettings] Consumer Key (first 10 chars): ${credentials.consumerKey?.substring(
          0,
          10,
        )}...`,
      );
      const response = await firstValueFrom(
        this.httpService.request<T>(config),
      );
      this.logger.log(`[StoreSettings] Response status: ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `[StoreSettings] Plugin API error: ${method} ${endpoint}`,
      );
      this.logger.error(
        `[StoreSettings] Error status: ${error.response?.status}`,
      );
      this.logger.error(
        `[StoreSettings] Error data:`,
        JSON.stringify(error.response?.data || error.message),
      );

      // Check if it's a 404 - plugin not installed
      if (error.response?.status === 404) {
        throw new NotFoundException(
          'CartFlow Bridge plugin not installed or endpoint not found. Please install the CartFlow Bridge plugin from the Plugins page.',
        );
      }

      // Check for 401/403 - authentication issues
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new ForbiddenException(
          'Authentication failed with WordPress. Please check your WooCommerce API credentials.',
        );
      }

      // Check for connection errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new BadRequestException(
          `Cannot connect to WordPress site. Please verify the store URL is correct and accessible.`,
        );
      }

      // Check for timeout
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        throw new BadRequestException(
          'Connection to WordPress site timed out. Please try again.',
        );
      }

      // Return WordPress error message if available
      if (error.response?.data?.message) {
        throw new BadRequestException(
          `WordPress error: ${error.response.data.message}`,
        );
      }

      throw new InternalServerErrorException(
        `Failed to communicate with WordPress: ${error.message}`,
      );
    }
  }

  // ============== PLUGIN STATUS ==============

  /**
   * Check if CartFlow Bridge plugin is installed and get version info
   */
  async checkPluginStatus(
    storeId: string,
    userId: string,
  ): Promise<{
    installed: boolean;
    version?: string;
    features?: Record<string, any>;
    message: string;
  }> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    try {
      // Try the new plugin/info endpoint first (v1.1.0+)
      const pluginInfo = await this.pluginRequest<any>(
        credentials,
        'GET',
        'plugin/info',
      );
      return {
        installed: true,
        version: pluginInfo.version || '1.0.0',
        features: pluginInfo.features || {},
        message: 'CartFlow Bridge plugin is installed and active',
      };
    } catch (error) {
      // Fall back to system/info for older versions
      if (error instanceof NotFoundException) {
        try {
          await this.pluginRequest<any>(credentials, 'GET', 'system/info');
          return {
            installed: true,
            version: '1.0.0', // Older version without plugin/info endpoint
            message: 'CartFlow Bridge plugin is installed (version 1.0.0)',
          };
        } catch {
          return {
            installed: false,
            message:
              'CartFlow Bridge plugin is not installed. Please download and install it from the Plugins page.',
          };
        }
      }
      throw error;
    }
  }

  /**
   * Get detailed plugin info including version and features
   */
  async getPluginInfo(
    storeId: string,
    userId: string,
  ): Promise<{
    name: string;
    version: string;
    features: Record<string, any>;
  }> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'plugin/info');
  }

  /**
   * Get shipping features settings
   */
  async getShippingFeatures(storeId: string, userId: string): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'features/shipping');
  }

  /**
   * Update shipping features settings
   */
  async updateShippingFeatures(
    storeId: string,
    userId: string,
    data: { hide_when_free_available: boolean },
  ): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'POST', 'features/shipping', data);
  }

  // ============== CURRENCY CONVERSION FEATURES ==============

  /**
   * Get currency conversion feature settings
   */
  async getCurrencyFeatures(storeId: string, userId: string): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'features/currency');
  }

  /**
   * Update currency conversion feature settings
   */
  async updateCurrencyFeatures(
    storeId: string,
    userId: string,
    data: any,
  ): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'POST', 'features/currency', data);
  }

  /**
   * Get live exchange rate from the store's WordPress plugin
   */
  async getLiveExchangeRate(
    storeId: string,
    userId: string,
    base?: string,
    target?: string,
  ): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    const query: string[] = [];
    if (base) query.push(`base=${base}`);
    if (target) query.push(`target=${target}`);
    const qs = query.length ? `?${query.join('&')}` : '';
    return this.pluginRequest(
      credentials,
      'GET',
      `features/currency/live-rate${qs}`,
    );
  }

  // ============== GENERAL SETTINGS ==============

  /**
   * Get WordPress general settings
   */
  async getGeneralSettings(storeId: string, userId: string): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'settings/general');
  }

  /**
   * Update WordPress general settings
   */
  async updateGeneralSettings(
    storeId: string,
    userId: string,
    data: Record<string, any>,
  ): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'POST', 'settings/general', data);
  }

  // ============== READING SETTINGS ==============

  /**
   * Get WordPress reading settings
   */
  async getReadingSettings(storeId: string, userId: string): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'settings/reading');
  }

  /**
   * Update WordPress reading settings
   */
  async updateReadingSettings(
    storeId: string,
    userId: string,
    data: Record<string, any>,
  ): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'POST', 'settings/reading', data);
  }

  // ============== WOOCOMMERCE SETTINGS ==============

  /**
   * Get WooCommerce settings
   */
  async getWooCommerceSettings(storeId: string, userId: string): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'settings/woocommerce');
  }

  /**
   * Update WooCommerce settings
   */
  async updateWooCommerceSettings(
    storeId: string,
    userId: string,
    data: Record<string, any>,
  ): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(
      credentials,
      'POST',
      'settings/woocommerce',
      data,
    );
  }

  // ============== SYSTEM INFO ==============

  /**
   * Get system info (WordPress, WooCommerce versions, etc.)
   */
  async getSystemInfo(storeId: string, userId: string): Promise<any> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    return this.pluginRequest(credentials, 'GET', 'system/info');
  }
}
