import { Injectable, Logger } from '@nestjs/common';
import {
  ResourceNotFoundException,
  AccessDeniedException,
  SystemErrorException,
  InvalidInputException,
  DuplicateResourceException,
} from '../shared/exceptions';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import {
  IShippingZone,
  IShippingZoneLocation,
  IShippingZoneMethod,
  IShippingMethod,
  IShippingMethodSettings,
} from './interface';
import {
  CreateShippingZoneDto,
  UpdateShippingZoneDto,
  UpdateShippingZoneLocationsDto,
  CreateShippingZoneMethodDto,
  UpdateShippingZoneMethodDto,
} from './dto';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Get store credentials and verify access
   */
  private async getStoreCredentials(storeId: string, userId: string) {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(storeId),
        isDeleted: false,
      })
      .select('+credentials');

    if (!store) {
      throw new ResourceNotFoundException('Store', storeId);
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new AccessDeniedException('store', 'user is not owner or member');
    }

    return {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };
  }

  /**
   * Transform WooCommerce zone method to internal format
   */
  private transformZoneMethod(method: any): IShippingZoneMethod {
    const settings: IShippingMethodSettings = {};

    if (method.settings) {
      Object.entries(method.settings).forEach(
        ([key, setting]: [string, any]) => {
          if (setting && typeof setting === 'object' && 'value' in setting) {
            settings[key] = setting.value;
          }
        },
      );
    }

    return {
      instanceId: method.instance_id,
      title: method.title,
      order: method.order,
      enabled: method.enabled,
      methodId: method.method_id,
      methodTitle: method.method_title,
      methodDescription: method.method_description,
      settings,
    };
  }

  // ============== SHIPPING ZONES ==============

  /**
   * Get all shipping zones with their locations and methods
   */
  async getZones(storeId: string, userId: string): Promise<IShippingZone[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const zones = await this.wooCommerceService.getShippingZones(credentials);
      this.logger.log(`[Shipping] Fetched ${zones.length} shipping zones`);

      // Fetch locations and methods for each zone
      const zonesWithDetails = await Promise.all(
        zones.map(async (zone) => {
          const [locations, methods] = await Promise.all([
            this.wooCommerceService.getShippingZoneLocations(
              credentials,
              zone.id,
            ),
            this.wooCommerceService.getShippingZoneMethods(
              credentials,
              zone.id,
            ),
          ]);

          this.logger.log(
            `[Shipping] Zone ${zone.id} (${zone.name}): ${locations.length} locations, ${methods.length} methods`,
          );
          if (methods.length > 0) {
            this.logger.log(
              `[Shipping] Zone ${zone.id} methods: ${JSON.stringify(
                methods.map((m) => ({
                  id: m.instance_id,
                  method_id: m.method_id,
                  title: m.title,
                })),
              )}`,
            );
          }

          return {
            id: zone.id,
            name: zone.name,
            order: zone.order,
            locations: locations as IShippingZoneLocation[],
            methods: methods.map((m) => this.transformZoneMethod(m)),
          };
        }),
      );

      return zonesWithDetails;
    } catch (error) {
      this.logger.error(
        `Failed to fetch shipping zones: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch shipping zones', error.message);
    }
  }

  /**
   * Get a single shipping zone with details
   */
  async getZone(
    storeId: string,
    userId: string,
    zoneId: number,
  ): Promise<IShippingZone> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const [zone, locations, methods] = await Promise.all([
        this.wooCommerceService.getShippingZone(credentials, zoneId),
        this.wooCommerceService.getShippingZoneLocations(credentials, zoneId),
        this.wooCommerceService.getShippingZoneMethods(credentials, zoneId),
      ]);

      return {
        id: zone.id,
        name: zone.name,
        order: zone.order,
        locations: locations as IShippingZoneLocation[],
        methods: methods.map((m) => this.transformZoneMethod(m)),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch shipping zone: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch shipping zone', error.message);
    }
  }

  /**
   * Create a new shipping zone
   */
  async createZone(
    storeId: string,
    userId: string,
    dto: CreateShippingZoneDto,
  ): Promise<IShippingZone> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const zone = await this.wooCommerceService.createShippingZone(
        credentials,
        {
          name: dto.name,
          order: dto.order,
        },
      );

      // Attempt to clear WooCommerce's auto-assigned default locations
      try {
        await this.wooCommerceService.updateShippingZoneLocations(
          credentials,
          zone.id,
          [],
        );
      } catch (e) {
        // WooCommerce may reject empty locations — that's fine
      }

      // Fetch actual locations (WooCommerce may have kept the default)
      const locations =
        await this.wooCommerceService.getShippingZoneLocations(
          credentials,
          zone.id,
        );

      return {
        id: zone.id,
        name: zone.name,
        order: zone.order,
        locations: locations as IShippingZoneLocation[],
        methods: [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to create shipping zone: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('create shipping zone', error.message);
    }
  }

  /**
   * Update a shipping zone
   */
  async updateZone(
    storeId: string,
    userId: string,
    zoneId: number,
    dto: UpdateShippingZoneDto,
  ): Promise<IShippingZone> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const zone = await this.wooCommerceService.updateShippingZone(
        credentials,
        zoneId,
        {
          name: dto.name,
          order: dto.order,
        },
      );

      // Fetch current locations and methods
      const [locations, methods] = await Promise.all([
        this.wooCommerceService.getShippingZoneLocations(credentials, zoneId),
        this.wooCommerceService.getShippingZoneMethods(credentials, zoneId),
      ]);

      return {
        id: zone.id,
        name: zone.name,
        order: zone.order,
        locations: locations as IShippingZoneLocation[],
        methods: methods.map((m) => this.transformZoneMethod(m)),
      };
    } catch (error) {
      this.logger.error(
        `Failed to update shipping zone: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('update shipping zone', error.message);
    }
  }

  /**
   * Delete a shipping zone
   */
  async deleteZone(
    storeId: string,
    userId: string,
    zoneId: number,
  ): Promise<void> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      await this.wooCommerceService.deleteShippingZone(
        credentials,
        zoneId,
        true,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete shipping zone: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('delete shipping zone', error.message);
    }
  }

  // ============== SHIPPING ZONE LOCATIONS ==============

  /**
   * Get locations for a zone
   */
  async getZoneLocations(
    storeId: string,
    userId: string,
    zoneId: number,
  ): Promise<IShippingZoneLocation[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const locations = await this.wooCommerceService.getShippingZoneLocations(
        credentials,
        zoneId,
      );
      return locations as IShippingZoneLocation[];
    } catch (error) {
      this.logger.error(
        `Failed to fetch zone locations: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch zone locations', error.message);
    }
  }

  /**
   * Update locations for a zone (replaces all)
   */
  async updateZoneLocations(
    storeId: string,
    userId: string,
    zoneId: number,
    dto: UpdateShippingZoneLocationsDto,
  ): Promise<IShippingZoneLocation[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const locations =
        await this.wooCommerceService.updateShippingZoneLocations(
          credentials,
          zoneId,
          dto.locations,
        );
      return locations as IShippingZoneLocation[];
    } catch (error) {
      this.logger.error(
        `Failed to update zone locations: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('update zone locations', error.message);
    }
  }

  // ============== SHIPPING ZONE METHODS ==============

  /**
   * Get methods for a zone
   */
  async getZoneMethods(
    storeId: string,
    userId: string,
    zoneId: number,
  ): Promise<IShippingZoneMethod[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const methods = await this.wooCommerceService.getShippingZoneMethods(
        credentials,
        zoneId,
      );
      return methods.map((m) => this.transformZoneMethod(m));
    } catch (error) {
      this.logger.error(
        `Failed to fetch zone methods: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch zone methods', error.message);
    }
  }

  /**
   * Add a method to a zone
   */
  async createZoneMethod(
    storeId: string,
    userId: string,
    zoneId: number,
    dto: CreateShippingZoneMethodDto,
  ): Promise<IShippingZoneMethod> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const method = await this.wooCommerceService.createShippingZoneMethod(
        credentials,
        zoneId,
        {
          method_id: dto.methodId,
          order: dto.order,
          enabled: dto.enabled ?? true,
          settings: dto.settings,
        },
      );
      return this.transformZoneMethod(method);
    } catch (error) {
      this.logger.error(
        `Failed to add zone method: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('add zone method', error.message);
    }
  }

  /**
   * Update a method in a zone
   */
  async updateZoneMethod(
    storeId: string,
    userId: string,
    zoneId: number,
    instanceId: number,
    dto: UpdateShippingZoneMethodDto,
  ): Promise<IShippingZoneMethod> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const method = await this.wooCommerceService.updateShippingZoneMethod(
        credentials,
        zoneId,
        instanceId,
        {
          order: dto.order,
          enabled: dto.enabled,
          settings: dto.settings,
        },
      );
      return this.transformZoneMethod(method);
    } catch (error) {
      this.logger.error(
        `Failed to update zone method: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('update zone method', error.message);
    }
  }

  /**
   * Remove a method from a zone
   */
  async deleteZoneMethod(
    storeId: string,
    userId: string,
    zoneId: number,
    instanceId: number,
  ): Promise<void> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      await this.wooCommerceService.deleteShippingZoneMethod(
        credentials,
        zoneId,
        instanceId,
        true,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete zone method: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('delete zone method', error.message);
    }
  }

  // ============== AVAILABLE SHIPPING METHODS ==============

  /**
   * Get available shipping method types
   */
  async getAvailableMethods(
    storeId: string,
    userId: string,
  ): Promise<IShippingMethod[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const methods = await this.wooCommerceService.getShippingMethods(
        credentials,
      );
      return methods.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch shipping methods: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch shipping methods', error.message);
    }
  }

  // ============== COUNTRIES & STATES ==============

  /**
   * Get all countries with their states from WooCommerce
   */
  async getCountries(storeId: string, userId: string): Promise<any[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const countries = await this.wooCommerceService.getCountries(credentials);
      return countries.map((c) => ({
        code: c.code,
        name: c.name,
        states: c.states || [],
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch countries: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch countries', error.message);
    }
  }

  /**
   * Get states for a specific country
   */
  async getCountryStates(
    storeId: string,
    userId: string,
    countryCode: string,
  ): Promise<any> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const country = await this.wooCommerceService.getCountry(
        credentials,
        countryCode,
      );
      return {
        code: country.code,
        name: country.name,
        states: country.states || [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch country states: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch country states', error.message);
    }
  }

  // ============== CUSTOM LOCATIONS (via CartFlow Plugin) ==============

  /**
   * Get all custom states added via CartFlow plugin
   */
  async getCustomStates(
    storeId: string,
    userId: string,
  ): Promise<Record<string, Record<string, string>>> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      return await this.wooCommerceService.getCustomStates(credentials);
    } catch (error) {
      // If plugin is not installed, return empty object
      if (error.response?.status === 404) {
        this.logger.warn('CartFlow Locations plugin not installed on store');
        return {};
      }
      this.logger.error(
        `Failed to fetch custom states: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch custom states', error.message);
    }
  }

  /**
   * Add a custom state via CartFlow plugin
   */
  async addCustomState(
    storeId: string,
    userId: string,
    countryCode: string,
    stateCode: string,
    stateName: string,
  ): Promise<{ success: boolean; message: string; state: any }> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      return await this.wooCommerceService.addCustomState(
        credentials,
        countryCode,
        stateCode,
        stateName,
      );
    } catch (error) {
      if (error.response?.status === 404) {
        throw new InvalidInputException(
          'CartFlow Locations plugin',
          'plugin is not installed on the store',
        );
      }
      if (error.response?.status === 409) {
        throw new DuplicateResourceException('State', 'code', stateCode);
      }
      this.logger.error(
        `Failed to add custom state: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('add custom state', error.message);
    }
  }

  /**
   * Update a custom state via CartFlow plugin
   */
  async updateCustomState(
    storeId: string,
    userId: string,
    countryCode: string,
    stateCode: string,
    stateName: string,
  ): Promise<{ success: boolean; message: string; state: any }> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      return await this.wooCommerceService.updateCustomState(
        credentials,
        countryCode,
        stateCode,
        stateName,
      );
    } catch (error) {
      if (error.response?.status === 404) {
        throw new ResourceNotFoundException(
          'State or CartFlow plugin',
          `${countryCode}:${stateCode}`,
        );
      }
      this.logger.error(
        `Failed to update custom state: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('update custom state', error.message);
    }
  }

  /**
   * Delete a custom state via CartFlow plugin
   */
  async deleteCustomState(
    storeId: string,
    userId: string,
    countryCode: string,
    stateCode: string,
  ): Promise<{ success: boolean; message: string }> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      return await this.wooCommerceService.deleteCustomState(
        credentials,
        countryCode,
        stateCode,
      );
    } catch (error) {
      if (error.response?.status === 404) {
        throw new ResourceNotFoundException(
          'State or CartFlow plugin',
          `${countryCode}:${stateCode}`,
        );
      }
      this.logger.error(
        `Failed to delete custom state: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('delete custom state', error.message);
    }
  }

  /**
   * Bulk update states for a country via CartFlow plugin
   */
  async bulkUpdateStates(
    storeId: string,
    userId: string,
    countryCode: string,
    states: Array<{ code: string; name: string; groups?: string[] }>,
    groups?: Array<{ name: string; color?: string; description?: string }>,
  ): Promise<{
    success: boolean;
    message: string;
    states: Record<string, string>;
    groups_synced?: number;
  }> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      return await this.wooCommerceService.bulkUpdateStates(
        credentials,
        countryCode,
        states,
        groups,
      );
    } catch (error) {
      if (error.response?.status === 404) {
        throw new InvalidInputException(
          'CartFlow Locations plugin',
          'plugin is not installed on the store',
        );
      }
      this.logger.error(
        `Failed to bulk update states: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('bulk update states', error.message);
    }
  }

  /**
   * Set state visibility in WooCommerce checkout via CartFlow plugin,
   * then verify by reading back the hidden states list.
   */
  async setStateVisibility(
    storeId: string,
    userId: string,
    countryCode: string,
    stateCode: string,
    visible: boolean,
  ): Promise<{
    success: boolean;
    verified: boolean;
    message: string;
    country_code: string;
    state_code: string;
    visible: boolean;
  }> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      const result = await this.wooCommerceService.setStateVisibility(
        credentials,
        countryCode,
        stateCode,
        visible,
      );

      // Verify by reading back the hidden states
      const hiddenStates =
        await this.wooCommerceService.getHiddenStates(credentials);
      const countryHidden = hiddenStates[countryCode] || [];
      const isHidden = countryHidden.includes(stateCode);
      const verified = visible ? !isHidden : isHidden;

      if (!verified) {
        this.logger.warn(
          `State visibility verification failed: ${countryCode}:${stateCode} expected ${visible ? 'visible' : 'hidden'} but found ${isHidden ? 'hidden' : 'visible'}`,
        );
      }

      return { ...result, verified };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new InvalidInputException(
          'CartFlow Locations plugin',
          'plugin v1.1.0+ is required for state visibility',
        );
      }
      this.logger.error(
        `Failed to set state visibility: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('set state visibility', error.message);
    }
  }

  /**
   * Get all countries with custom states (uses CartFlow plugin endpoint)
   */
  async getCountriesWithCustomStates(
    storeId: string,
    userId: string,
  ): Promise<any[]> {
    const credentials = await this.getStoreCredentials(storeId, userId);

    try {
      return await this.wooCommerceService.getCountriesWithCustomStates(
        credentials,
      );
    } catch (error) {
      // Fallback to standard WooCommerce countries if plugin is not installed
      if (error.response?.status === 404) {
        this.logger.warn(
          'CartFlow Locations plugin not installed, falling back to WooCommerce countries',
        );
        return this.getCountries(storeId, userId);
      }
      this.logger.error(
        `Failed to fetch countries with custom states: ${error.message}`,
        error.stack,
      );
      throw new SystemErrorException('fetch countries', error.message);
    }
  }
}
