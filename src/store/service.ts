import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Store, StoreDocument } from './schema';
import { CreateStoreDto } from './dto.create';
import { UpdateStoreDto, UpdateCredentialsDto } from './dto.update';
import { QueryStoreDto } from './dto.query';
import { IStore, IStoreResponse, IConnectionTestResult } from './interface';
import { StoreStatus, SyncStatus } from './enum';
import { Organization, OrganizationDocument } from '../organization/schema';
import { OrganizationMemberRole } from '../organization/enum';
import { UserDocument } from '../schema/user.schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { SubscriptionService } from '../subscription/service';

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly wooCommerceService: WooCommerceService,
    @Inject(forwardRef(() => SubscriptionService))
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Create a new store connection
   * No store limit - each store is billed $19/month
   */
  async create(user: UserDocument, dto: CreateStoreDto): Promise<IStore> {
    // Verify organization access
    await this.verifyOrganizationAccess(dto.organizationId, user._id.toString());

    // Check for duplicate URL within organization
    const existingStore = await this.storeModel.findOne({
      organizationId: new Types.ObjectId(dto.organizationId),
      url: dto.url,
      isDeleted: false,
    });

    if (existingStore) {
      throw new ConflictException('A store with this URL already exists in your organization');
    }

    // Create store with initial status
    const store = await this.storeModel.create({
      organizationId: new Types.ObjectId(dto.organizationId),
      name: dto.name,
      platform: dto.platform,
      url: dto.url.replace(/\/+$/, ''), // Remove trailing slashes
      credentials: {
        consumerKey: dto.consumerKey,
        consumerSecret: dto.consumerSecret,
      },
      status: StoreStatus.CONNECTING,
      syncStatus: {
        products: { status: SyncStatus.IDLE, itemCount: 0 },
        orders: { status: SyncStatus.IDLE, itemCount: 0 },
        customers: { status: SyncStatus.IDLE, itemCount: 0 },
        reviews: { status: SyncStatus.IDLE, itemCount: 0 },
      },
      settings: {
        autoSync: true,
        syncInterval: 15,
        lowStockThreshold: 10,
      },
    });

    // Create subscription for the new store ($19/month, post-paid)
    try {
      await this.subscriptionService.createSubscription(
        store._id.toString(),
        dto.organizationId,
        dto.name,
        dto.url,
      );
    } catch (error) {
      // Log error but don't fail store creation
      console.error(`Failed to create subscription for store ${store._id}: ${error.message}`);
    }

    return this.toInterface(store);
  }

  /**
   * Get stores for user's organizations
   */
  async findByUser(userId: string, query: QueryStoreDto): Promise<IStoreResponse> {
    // Get organizations user has access to
    const organizations = await this.organizationModel.find({
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    }).select('_id');

    const orgIds = organizations.map((org) => org._id);

    const filter: any = {
      organizationId: { $in: orgIds },
      isDeleted: false,
    };

    // Apply additional filters
    if (query.organizationId) {
      filter.organizationId = new Types.ObjectId(query.organizationId);
    }
    if (query.platform) {
      filter.platform = query.platform;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { url: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 10;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [stores, total] = await Promise.all([
      this.storeModel.find(filter).sort(sort).skip(skip).limit(size),
      this.storeModel.countDocuments(filter),
    ]);

    return {
      stores: stores.map((store) => this.toInterface(store)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get store by ID
   */
  async findById(id: string, userId: string): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has access to organization
    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    return this.toInterface(store);
  }

  /**
   * Update store settings
   */
  async update(id: string, userId: string, dto: UpdateStoreDto): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has access
    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    // Update fields
    if (dto.name) store.name = dto.name;
    if (dto.autoSync !== undefined) store.settings.autoSync = dto.autoSync;
    if (dto.syncInterval !== undefined) store.settings.syncInterval = dto.syncInterval;
    if (dto.lowStockThreshold !== undefined) store.settings.lowStockThreshold = dto.lowStockThreshold;
    if (dto.timezone) store.settings.timezone = dto.timezone;

    await store.save();
    return this.toInterface(store);
  }

  /**
   * Update store credentials
   */
  async updateCredentials(id: string, userId: string, dto: UpdateCredentialsDto): Promise<IStore> {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      })
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has access
    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    // Update credentials
    if (dto.consumerKey) store.credentials.consumerKey = dto.consumerKey;
    if (dto.consumerSecret) store.credentials.consumerSecret = dto.consumerSecret;

    // Reset status to connecting after credential update
    store.status = StoreStatus.CONNECTING;

    await store.save();
    return this.toInterface(store);
  }

  /**
   * Test store connection
   */
  async testConnection(id: string, userId: string): Promise<IConnectionTestResult> {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      })
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has access
    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    try {
      const result = await this.wooCommerceService.testConnection({
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      });

      if (result.success) {
        store.status = StoreStatus.ACTIVE;
        store.lastError = undefined;
        // Save store info from WooCommerce
        if (result.storeInfo) {
          store.settings.currency = result.storeInfo.currency;
          store.settings.timezone = result.storeInfo.timezone;
        }
      } else {
        store.status = StoreStatus.ERROR;
        store.lastError = result.message;
      }

      await store.save();
      return result;
    } catch (error) {
      store.status = StoreStatus.ERROR;
      store.lastError = error.message;
      await store.save();

      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Update store status
   */
  async updateStatus(id: string, status: StoreStatus, error?: string): Promise<void> {
    await this.storeModel.updateOne(
      { _id: new Types.ObjectId(id) },
      {
        status,
        lastError: error,
        updatedAt: new Date(),
      },
    );
  }

  /**
   * Update sync status for a specific entity type
   */
  async updateSyncStatus(
    id: string,
    entityType: 'products' | 'orders' | 'customers' | 'reviews',
    status: SyncStatus,
    itemCount?: number,
    error?: string,
  ): Promise<void> {
    const updateData: any = {
      [`syncStatus.${entityType}.status`]: status,
      updatedAt: new Date(),
    };

    if (status === SyncStatus.SYNCING) {
      updateData[`syncStatus.${entityType}.lastSync`] = new Date();
    }
    if (itemCount !== undefined) {
      updateData[`syncStatus.${entityType}.itemCount`] = itemCount;
    }
    if (error) {
      updateData[`syncStatus.${entityType}.error`] = error;
    }

    await this.storeModel.updateOne({ _id: new Types.ObjectId(id) }, updateData);
  }

  /**
   * Soft delete store
   */
  async delete(id: string, userId: string): Promise<void> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has access
    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    store.isDeleted = true;
    store.status = StoreStatus.DISCONNECTED;
    await store.save();
  }

  /**
   * Get webhook configuration for a store
   */
  async getWebhookConfig(id: string, userId: string): Promise<{
    webhookUrl: string;
    webhookSecret: string;
    topics: string[];
    instructions: string;
  }> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    // Generate webhook secret if not exists
    if (!store.webhookSecret) {
      store.webhookSecret = this.generateWebhookSecret();
      await store.save();
    }

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3041';
    const webhookUrl = `${baseUrl}/api/webhooks/woocommerce/${id}`;

    return {
      webhookUrl,
      webhookSecret: store.webhookSecret,
      topics: [
        'order.created',
        'order.updated',
        'order.deleted',
        'product.created',
        'product.updated',
        'product.deleted',
        'customer.created',
        'customer.updated',
        'customer.deleted',
      ],
      instructions: `To enable real-time sync, add webhooks in WooCommerce:
1. Go to WooCommerce > Settings > Advanced > Webhooks
2. Click "Add webhook"
3. Set Status to "Active"
4. Set Delivery URL to: ${webhookUrl}
5. Set Secret to: ${store.webhookSecret}
6. Select a Topic from the list above (create one webhook per topic)
7. Click "Save webhook"

Create webhooks for all the topics you want to sync in real-time.`,
    };
  }

  /**
   * Regenerate webhook secret for a store
   */
  async regenerateWebhookSecret(id: string, userId: string): Promise<{
    webhookSecret: string;
    message: string;
  }> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    await this.verifyOrganizationAccess(store.organizationId.toString(), userId);

    store.webhookSecret = this.generateWebhookSecret();
    await store.save();

    return {
      webhookSecret: store.webhookSecret,
      message: 'Webhook secret regenerated. Update your WooCommerce webhook settings with the new secret.',
    };
  }

  /**
   * Generate a random webhook secret
   */
  private generateWebhookSecret(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get store count for an organization
   */
  async getStoreCountByOrganization(organizationId: string): Promise<number> {
    return this.storeModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    });
  }

  /**
   * Get store with credentials (for sync service)
   */
  async getStoreWithCredentials(id: string): Promise<StoreDocument | null> {
    return this.storeModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      })
      .select('+credentials');
  }

  /**
   * Transfer store ownership to another organization
   * Only the current organization owner/admin can transfer a store
   * Updates ALL related records (products, orders, customers, reviews, etc.)
   */
  async transferStore(
    storeId: string,
    userId: string,
    targetOrganizationId: string,
  ): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has management access to the source organization
    await this.verifyOrganizationManagementAccess(
      store.organizationId.toString(),
      userId,
    );

    // Cannot transfer to the same organization
    if (store.organizationId.toString() === targetOrganizationId) {
      throw new BadRequestException('Store is already in this organization');
    }

    // Verify target organization exists and user has access to it
    const targetOrg = await this.organizationModel.findOne({
      _id: new Types.ObjectId(targetOrganizationId),
      isDeleted: false,
    });

    if (!targetOrg) {
      throw new NotFoundException('Target organization not found');
    }

    // Verify user has access to the target organization
    const isTargetOwner = targetOrg.ownerId.toString() === userId;
    const isTargetMember = targetOrg.members.some((m) => m.userId.toString() === userId);

    if (!isTargetOwner && !isTargetMember) {
      throw new ForbiddenException(
        'You must be a member of the target organization to transfer a store to it',
      );
    }

    // Check if a store with the same URL already exists in the target organization
    const existingStore = await this.storeModel.findOne({
      organizationId: new Types.ObjectId(targetOrganizationId),
      url: store.url,
      isDeleted: false,
    });

    if (existingStore) {
      throw new ConflictException(
        'A store with this URL already exists in the target organization',
      );
    }

    const previousOrgId = store.organizationId.toString();
    const storeObjectId = new Types.ObjectId(storeId);
    const newOrgObjectId = new Types.ObjectId(targetOrganizationId);

    this.logger.log(
      `Transferring store ${storeId} from org ${previousOrgId} to org ${targetOrganizationId}`,
    );

    // Update store's organization
    store.organizationId = newOrgObjectId;
    await store.save();

    // Update all related collections that have storeId and organizationId
    // Using direct collection access for bulk updates
    const collectionsToUpdate = [
      'products',
      'product_variants',
      'orders',
      'customers',
      'reviews',
      'response_templates',
      'categories',
      'tags',
      'attributes',
      'inventory_logs',
      'stock_alerts',
      'sync_jobs',
      'phones',
      'emails',
      'audit_logs',
      'customer_segments',
      'subscriptions',
      'invoices',
    ];

    const updatePromises = collectionsToUpdate.map(async (collectionName) => {
      try {
        const collection = this.connection.collection(collectionName);
        const result = await collection.updateMany(
          { storeId: storeObjectId },
          { $set: { organizationId: newOrgObjectId, updatedAt: new Date() } },
        );
        if (result.modifiedCount > 0) {
          this.logger.log(
            `Updated ${result.modifiedCount} records in ${collectionName} for store ${storeId}`,
          );
        }
        return { collection: collectionName, updated: result.modifiedCount };
      } catch (error) {
        this.logger.warn(
          `Failed to update ${collectionName} for store ${storeId}: ${error.message}`,
        );
        return { collection: collectionName, updated: 0, error: error.message };
      }
    });

    const results = await Promise.all(updatePromises);
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    this.logger.log(`Total records updated for store ${storeId}: ${totalUpdated}`);

    return this.toInterface(store);
  }

  /**
   * Get organizations user can transfer stores to
   */
  async getTransferTargetOrganizations(
    storeId: string,
    userId: string,
  ): Promise<{ id: string; name: string }[]> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has management access to the current organization
    await this.verifyOrganizationManagementAccess(store.organizationId.toString(), userId);

    // Get all organizations user has access to (except the current one)
    const organizations = await this.organizationModel.find({
      isDeleted: false,
      _id: { $ne: store.organizationId },
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    }).select('_id name');

    return organizations.map((org) => ({
      id: org._id.toString(),
      name: org.name,
    }));
  }

  // Helper methods
  private async verifyOrganizationManagementAccess(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationDocument> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const isOwner = organization.ownerId.toString() === userId;
    const member = organization.members.find((m) => m.userId.toString() === userId);
    const isAdmin = member?.role === OrganizationMemberRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Only organization owners and admins can transfer stores');
    }

    return organization;
  }
  private async verifyOrganizationAccess(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationDocument> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const isOwner = organization.ownerId.toString() === userId;
    const isMember = organization.members.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    return organization;
  }

  private toInterface(doc: StoreDocument): IStore {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      organizationId: obj.organizationId.toString(),
      name: obj.name,
      platform: obj.platform,
      url: obj.url,
      status: obj.status,
      lastSyncAt: obj.lastSyncAt,
      syncStatus: obj.syncStatus,
      settings: obj.settings,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
