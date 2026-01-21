import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tag, TagDocument } from './schema';
import { CreateTagDto, UpdateTagDto, QueryTagDto } from './dto';
import { ITag, ITagResponse } from './interface';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooTagFull } from '../integrations/woocommerce/woocommerce.types';

@Injectable()
export class TagService {
  private readonly logger = new Logger(TagService.name);

  constructor(
    @InjectModel(Tag.name) private tagModel: Model<TagDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Create a new tag
   */
  async create(
    userId: string,
    storeId: string,
    dto: CreateTagDto,
  ): Promise<ITag> {
    const store = await this.getStoreWithAccess(storeId, userId);

    // Create in WooCommerce first
    const wooData = {
      name: dto.name,
      slug: dto.slug,
      description: dto.description || '',
    };

    const wooTag = await this.wooCommerceService.createTag(
      {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      },
      wooData,
    );

    // Create in local database
    const tag = await this.tagModel.create({
      storeId: store._id,
      externalId: wooTag.id,
      name: wooTag.name,
      slug: wooTag.slug,
      description: wooTag.description || '',
      count: wooTag.count || 0,
      lastSyncedAt: new Date(),
      pendingSync: false,
    });

    return this.toInterface(tag);
  }

  /**
   * Get tags with pagination and filtering
   */
  async findByStore(userId: string, query: QueryTagDto): Promise<ITagResponse> {
    if (!query.storeId) {
      throw new NotFoundException('Store ID is required');
    }

    const store = await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: store._id,
      isDeleted: false,
    };

    // Search by keyword
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { slug: { $regex: query.keyword, $options: 'i' } },
        { description: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 50;
    const skip = (page - 1) * size;

    const [tags, total] = await Promise.all([
      this.tagModel.find(filter).sort({ name: 1 }).skip(skip).limit(size),
      this.tagModel.countDocuments(filter),
    ]);

    return {
      tags: tags.map((t) => this.toInterface(t)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single tag by ID
   */
  async findById(userId: string, tagId: string): Promise<ITag> {
    const tag = await this.tagModel.findOne({
      _id: new Types.ObjectId(tagId),
      isDeleted: false,
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    // Verify access
    await this.getStoreWithAccess(tag.storeId.toString(), userId);

    return this.toInterface(tag);
  }

  /**
   * Update a tag
   */
  async update(
    userId: string,
    tagId: string,
    dto: UpdateTagDto,
  ): Promise<ITag> {
    const tag = await this.tagModel.findOne({
      _id: new Types.ObjectId(tagId),
      isDeleted: false,
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    const store = await this.getStoreWithAccess(tag.storeId.toString(), userId);

    // Update in WooCommerce
    const wooData: any = {};
    if (dto.name !== undefined) wooData.name = dto.name;
    if (dto.slug !== undefined) wooData.slug = dto.slug;
    if (dto.description !== undefined) wooData.description = dto.description;

    const wooTag = await this.wooCommerceService.updateTag(
      {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      },
      tag.externalId,
      wooData,
    );

    // Update local database
    if (dto.name !== undefined) tag.name = dto.name;
    if (dto.slug !== undefined) tag.slug = wooTag.slug;
    if (dto.description !== undefined) tag.description = dto.description;
    tag.lastSyncedAt = new Date();

    await tag.save();
    return this.toInterface(tag);
  }

  /**
   * Delete a tag
   */
  async delete(userId: string, tagId: string): Promise<void> {
    const tag = await this.tagModel.findOne({
      _id: new Types.ObjectId(tagId),
      isDeleted: false,
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    const store = await this.getStoreWithAccess(tag.storeId.toString(), userId);

    // Delete from WooCommerce
    await this.wooCommerceService.deleteTag(
      {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      },
      tag.externalId,
      true, // force delete
    );

    // Soft delete locally
    tag.isDeleted = true;
    await tag.save();
  }

  /**
   * Sync tags from WooCommerce
   */
  async syncFromWooCommerce(
    userId: string,
    storeId: string,
  ): Promise<{ synced: number; created: number; updated: number }> {
    const store = await this.getStoreWithAccess(storeId, userId);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    let allTags: WooTagFull[] = [];
    let page = 1;
    let hasMore = true;

    // Fetch all tags from WooCommerce
    while (hasMore) {
      const result = await this.wooCommerceService.getTags(
        credentials,
        page,
        100,
      );
      allTags = allTags.concat(result.data);
      hasMore = page < result.totalPages;
      page++;
    }

    let created = 0;
    let updated = 0;

    for (const wooTag of allTags) {
      const tag = await this.tagModel.findOne({
        storeId: store._id,
        externalId: wooTag.id,
      });

      const tagData = {
        storeId: store._id,
        externalId: wooTag.id,
        name: wooTag.name,
        slug: wooTag.slug,
        description: wooTag.description || '',
        count: wooTag.count || 0,
        lastSyncedAt: new Date(),
        pendingSync: false,
        isDeleted: false,
      };

      if (tag) {
        Object.assign(tag, tagData);
        await tag.save();
        updated++;
      } else {
        await this.tagModel.create(tagData);
        created++;
      }
    }

    this.logger.log(
      `Tag sync completed for store ${storeId}: ${created} created, ${updated} updated`,
    );

    return {
      synced: allTags.length,
      created,
      updated,
    };
  }

  /**
   * Get tag count for a store
   */
  async getTagCountByStore(storeId: string): Promise<number> {
    return this.tagModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  // Helper methods

  private async getStoreWithAccess(
    storeId: string,
    userId: string,
  ): Promise<StoreDocument> {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(storeId),
        isDeleted: false,
      })
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify store access - check if user is owner or member
    const isOwner = store.ownerId?.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  private toInterface(doc: TagDocument): ITag {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      externalId: obj.externalId,
      name: obj.name,
      slug: obj.slug,
      description: obj.description,
      count: obj.count,
      lastSyncedAt: obj.lastSyncedAt,
      pendingSync: obj.pendingSync,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
