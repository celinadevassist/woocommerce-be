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
import { Store, StoreDocument, StoreMember } from './schema';
import { CreateStoreDto } from './dto.create';
import { UpdateStoreDto, UpdateCredentialsDto } from './dto.update';
import { QueryStoreDto } from './dto.query';
import { IStore, IStoreResponse, IConnectionTestResult, IStoreMember } from './interface';
import { StoreStatus, SyncStatus, StoreMemberRole } from './enum';
import { UserDocument } from '../schema/user.schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { SubscriptionService } from '../subscription/service';

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly wooCommerceService: WooCommerceService,
    @Inject(forwardRef(() => SubscriptionService))
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Create a new store connection
   * The creating user becomes the owner
   */
  async create(user: UserDocument, dto: CreateStoreDto): Promise<IStore> {
    // Check for duplicate URL (globally unique)
    const existingStore = await this.storeModel.findOne({
      url: dto.url,
      isDeleted: false,
    });

    if (existingStore) {
      throw new ConflictException('A store with this URL already exists');
    }

    // Create store with user as owner
    const store = await this.storeModel.create({
      ownerId: user._id,
      members: [], // Owner is tracked separately, not in members array
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
   * Get stores for user (owned or member of)
   */
  async findByUser(userId: string, query: QueryStoreDto): Promise<IStoreResponse> {
    const userObjectId = new Types.ObjectId(userId);

    const filter: any = {
      isDeleted: false,
      $or: [
        { ownerId: userObjectId },
        { 'members.userId': userObjectId },
      ],
    };

    // Apply additional filters
    if (query.platform) {
      filter.platform = query.platform;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.keyword) {
      filter.$and = [
        {
          $or: [
            { ownerId: userObjectId },
            { 'members.userId': userObjectId },
          ],
        },
        {
          $or: [
            { name: { $regex: query.keyword, $options: 'i' } },
            { url: { $regex: query.keyword, $options: 'i' } },
          ],
        },
      ];
      delete filter.$or;
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
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      })
      .populate('ownerId', 'firstName lastName email')
      .populate('members.userId', 'firstName lastName email');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify user has access to store
    this.verifyStoreAccess(store, userId);

    return this.toInterfaceWithUsers(store);
  }

  /**
   * Convert store document to interface with populated user data
   */
  private toInterfaceWithUsers(store: StoreDocument): IStore {
    const base = this.toInterface(store);

    // Add populated owner data
    if (store.ownerId && typeof store.ownerId === 'object') {
      const owner = store.ownerId as any;
      (base as any).owner = {
        _id: owner._id?.toString(),
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
      };
    }

    // Add populated member user data
    if (store.members && store.members.length > 0) {
      (base as any).members = store.members.map((member: any) => {
        const memberData: any = {
          userId: member.userId?._id?.toString() || member.userId?.toString(),
          role: member.role,
          invitedAt: member.invitedAt,
          acceptedAt: member.acceptedAt,
        };

        // Add user info if populated
        if (member.userId && typeof member.userId === 'object' && member.userId.email) {
          memberData.user = {
            _id: member.userId._id?.toString(),
            firstName: member.userId.firstName,
            lastName: member.userId.lastName,
            email: member.userId.email,
          };
        }

        return memberData;
      });
    }

    return base;
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

    // Verify user has access (at least manager role)
    this.verifyStoreAccess(store, userId, [StoreMemberRole.OWNER, StoreMemberRole.ADMIN, StoreMemberRole.MANAGER]);

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

    // Only owner and admin can update credentials
    this.verifyStoreAccess(store, userId, [StoreMemberRole.OWNER, StoreMemberRole.ADMIN]);

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
    this.verifyStoreAccess(store, userId);

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

    // Only owner can delete store
    if (store.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only the store owner can delete the store');
    }

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

    this.verifyStoreAccess(store, userId);

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

    this.verifyStoreAccess(store, userId, [StoreMemberRole.OWNER, StoreMemberRole.ADMIN]);

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
   * Get store count for a user
   */
  async getStoreCountByUser(userId: string): Promise<number> {
    return this.storeModel.countDocuments({
      ownerId: new Types.ObjectId(userId),
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

  // ==================== MEMBER MANAGEMENT ====================

  /**
   * Add a member to the store
   */
  async addMember(
    storeId: string,
    userId: string,
    memberUserId: string,
    role: StoreMemberRole,
  ): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Only owner and admin can add members
    this.verifyStoreAccess(store, userId, [StoreMemberRole.OWNER, StoreMemberRole.ADMIN]);

    // Cannot add owner role via this method
    if (role === StoreMemberRole.OWNER) {
      throw new BadRequestException('Cannot add a member with owner role. Use transferOwnership instead.');
    }

    // Check if user is already owner
    if (store.ownerId.toString() === memberUserId) {
      throw new ConflictException('This user is already the store owner');
    }

    // Check if user is already a member
    const existingMember = store.members.find(
      (m) => m.userId.toString() === memberUserId,
    );

    if (existingMember) {
      throw new ConflictException('User is already a member of this store');
    }

    // Add member
    store.members.push({
      userId: new Types.ObjectId(memberUserId) as any,
      role,
      joinedAt: new Date(),
    } as StoreMember);

    await store.save();
    return this.toInterface(store);
  }

  /**
   * Remove a member from the store
   */
  async removeMember(storeId: string, userId: string, memberUserId: string): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Only owner and admin can remove members
    this.verifyStoreAccess(store, userId, [StoreMemberRole.OWNER, StoreMemberRole.ADMIN]);

    // Cannot remove owner
    if (store.ownerId.toString() === memberUserId) {
      throw new BadRequestException('Cannot remove the store owner. Use transferOwnership first.');
    }

    // Find and remove member
    const memberIndex = store.members.findIndex(
      (m) => m.userId.toString() === memberUserId,
    );

    if (memberIndex === -1) {
      throw new NotFoundException('Member not found in this store');
    }

    // Admin cannot remove another admin (only owner can)
    const isOwner = store.ownerId.toString() === userId;
    const memberToRemove = store.members[memberIndex];
    if (!isOwner && memberToRemove.role === StoreMemberRole.ADMIN) {
      throw new ForbiddenException('Only the owner can remove admin members');
    }

    store.members.splice(memberIndex, 1);
    await store.save();
    return this.toInterface(store);
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(
    storeId: string,
    userId: string,
    memberUserId: string,
    newRole: StoreMemberRole,
  ): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Only owner can change roles
    if (store.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only the store owner can change member roles');
    }

    // Cannot change owner role via this method
    if (newRole === StoreMemberRole.OWNER) {
      throw new BadRequestException('Cannot assign owner role. Use transferOwnership instead.');
    }

    // Find member
    const member = store.members.find(
      (m) => m.userId.toString() === memberUserId,
    );

    if (!member) {
      throw new NotFoundException('Member not found in this store');
    }

    member.role = newRole;
    await store.save();
    return this.toInterface(store);
  }

  /**
   * Transfer store ownership to another user
   * The old owner becomes an admin
   */
  async transferOwnership(
    storeId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ): Promise<IStore> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Only current owner can transfer ownership
    if (store.ownerId.toString() !== currentOwnerId) {
      throw new ForbiddenException('Only the store owner can transfer ownership');
    }

    // Cannot transfer to self
    if (currentOwnerId === newOwnerId) {
      throw new BadRequestException('Cannot transfer ownership to yourself');
    }

    const newOwnerObjectId = new Types.ObjectId(newOwnerId);
    const oldOwnerObjectId = store.ownerId;

    this.logger.log(
      `Transferring store ${storeId} ownership from ${currentOwnerId} to ${newOwnerId}`,
    );

    // Check if new owner is already a member
    const existingMemberIndex = store.members.findIndex(
      (m) => m.userId.toString() === newOwnerId,
    );

    // Remove new owner from members if they were a member
    if (existingMemberIndex !== -1) {
      store.members.splice(existingMemberIndex, 1);
    }

    // Add old owner as admin member
    store.members.push({
      userId: oldOwnerObjectId as any,
      role: StoreMemberRole.ADMIN,
      joinedAt: new Date(),
    } as StoreMember);

    // Set new owner
    store.ownerId = newOwnerObjectId as any;

    await store.save();

    this.logger.log(
      `Store ${storeId} ownership transferred. Old owner ${currentOwnerId} is now admin.`,
    );

    return this.toInterface(store);
  }

  /**
   * Get store members with user details
   */
  async getMembers(storeId: string, userId: string): Promise<IStoreMember[]> {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(storeId),
        isDeleted: false,
      })
      .populate('ownerId', 'name email')
      .populate('members.userId', 'name email');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    this.verifyStoreAccess(store, userId);

    // Build members list including owner
    const members: IStoreMember[] = [];

    // Add owner first
    const ownerUser = store.ownerId as any;
    members.push({
      userId: ownerUser._id?.toString() || store.ownerId.toString(),
      role: StoreMemberRole.OWNER,
      joinedAt: store.createdAt,
      name: ownerUser.name,
      email: ownerUser.email,
    });

    // Add other members
    for (const member of store.members) {
      const memberUser = member.userId as any;
      members.push({
        userId: memberUser._id?.toString() || member.userId.toString(),
        role: member.role,
        joinedAt: member.joinedAt,
        name: memberUser.name,
        email: memberUser.email,
      });
    }

    return members;
  }

  /**
   * Leave a store (for non-owner members)
   */
  async leaveStore(storeId: string, userId: string): Promise<void> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Owner cannot leave, must transfer ownership first
    if (store.ownerId.toString() === userId) {
      throw new BadRequestException('Owner cannot leave the store. Transfer ownership first.');
    }

    // Find and remove member
    const memberIndex = store.members.findIndex(
      (m) => m.userId.toString() === userId,
    );

    if (memberIndex === -1) {
      throw new NotFoundException('You are not a member of this store');
    }

    store.members.splice(memberIndex, 1);
    await store.save();
  }

  // ==================== HELPER METHODS ====================

  /**
   * Verify user has access to store
   * @param store The store document
   * @param userId The user ID to check
   * @param allowedRoles Optional array of roles that have access (defaults to all roles)
   */
  private verifyStoreAccess(
    store: StoreDocument,
    userId: string,
    allowedRoles?: StoreMemberRole[],
  ): void {
    const isOwner = store.ownerId.toString() === userId;
    const member = store.members.find((m) => m.userId.toString() === userId);

    if (!isOwner && !member) {
      throw new ForbiddenException('You do not have access to this store');
    }

    // If specific roles are required
    if (allowedRoles && allowedRoles.length > 0) {
      if (isOwner && allowedRoles.includes(StoreMemberRole.OWNER)) {
        return; // Owner has access
      }
      if (member && allowedRoles.includes(member.role)) {
        return; // Member has required role
      }
      throw new ForbiddenException('You do not have sufficient permissions for this action');
    }
  }

  /**
   * Get user's role in store
   */
  getUserRole(store: StoreDocument, userId: string): StoreMemberRole | null {
    if (store.ownerId.toString() === userId) {
      return StoreMemberRole.OWNER;
    }
    const member = store.members.find((m) => m.userId.toString() === userId);
    return member?.role || null;
  }

  private toInterface(doc: StoreDocument): IStore {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      ownerId: obj.ownerId.toString(),
      members: obj.members.map((m: any) => ({
        userId: m.userId.toString(),
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      name: obj.name,
      platform: obj.platform,
      url: obj.url,
      status: obj.status,
      lastSyncAt: obj.lastSyncAt,
      syncStatus: obj.syncStatus,
      settings: obj.settings,
      productCount: obj.productCount,
      orderCount: obj.orderCount,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
