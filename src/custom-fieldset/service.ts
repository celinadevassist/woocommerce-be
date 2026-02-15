import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomFieldset } from './schema';
import { Store } from '../store/schema';
import { Product } from '../product/schema';
import { Category } from '../category/schema';
import { Tag } from '../tag/schema';
import { Attribute } from '../attribute/schema';
import {
  CreateCustomFieldsetDto,
  UpdateCustomFieldsetDto,
  QueryCustomFieldsetDto,
  ReorderCustomFieldsetDto,
} from './dto';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';

type CustomFieldsetDocument = CustomFieldset & Document;
type StoreDocument = Store & Document & {
  ownerId: Types.ObjectId;
  members: Array<{ userId: Types.ObjectId; role: string }>;
  url: string;
  credentials: {
    consumerKey: string;
    consumerSecret: string;
    wpUsername?: string;
    wpAppPassword?: string;
  };
};

@Injectable()
export class CustomFieldsetService {
  private readonly logger = new Logger(CustomFieldsetService.name);

  constructor(
    @InjectModel(CustomFieldset.name)
    private fieldsetModel: Model<CustomFieldset>,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
    @InjectModel(Attribute.name) private attributeModel: Model<Attribute>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Create a new custom fieldset
   */
  async create(
    userId: string,
    storeId: string,
    dto: CreateCustomFieldsetDto,
  ) {
    const store = await this.getStoreWithAccess(storeId, userId);

    const fieldset = await this.fieldsetModel.create({
      storeId: store._id,
      name: dto.name,
      status: dto.status || 'active',
      scope: dto.scope || 'product',
      assignmentType: dto.assignmentType,
      productIds: (dto.productIds || []).map((id) => new Types.ObjectId(id)),
      categoryIds: (dto.categoryIds || []).map((id) => new Types.ObjectId(id)),
      tagIds: (dto.tagIds || []).map((id) => new Types.ObjectId(id)),
      productTypes: dto.productTypes || [],
      attributeIds: (dto.attributeIds || []).map((id) => new Types.ObjectId(id)),
      fields: dto.fields,
      position: dto.position || 0,
    });

    return fieldset.toObject();
  }

  /**
   * Get all fieldsets for a store with filters
   */
  async findAll(userId: string, query: QueryCustomFieldsetDto) {
    if (!query.storeId) {
      throw new NotFoundException('Store ID is required');
    }

    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.assignmentType) {
      filter.assignmentType = query.assignmentType;
    }

    if (query.scope) {
      filter.scope = query.scope;
    }

    if (query.keyword) {
      const escaped = query.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 50;
    const skip = (page - 1) * size;

    const [fieldsets, total] = await Promise.all([
      this.fieldsetModel
        .find(filter)
        .sort({ position: 1, createdAt: -1 })
        .skip(skip)
        .limit(size)
        .populate('productIds', 'name externalId')
        .populate('categoryIds', 'name externalId')
        .populate('tagIds', 'name externalId')
        .populate('attributeIds', 'name wooId')
        .lean(),
      this.fieldsetModel.countDocuments(filter),
    ]);

    return {
      fieldsets,
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single fieldset by ID
   */
  async findById(userId: string, fieldsetId: string) {
    const fieldset = await this.fieldsetModel
      .findOne({
        _id: new Types.ObjectId(fieldsetId),
        isDeleted: false,
      })
      .populate('productIds', 'name externalId')
      .populate('categoryIds', 'name externalId')
      .populate('tagIds', 'name externalId')
      .populate('attributeIds', 'name wooId')
      .lean();

    if (!fieldset) {
      throw new NotFoundException('Custom fieldset not found');
    }

    await this.getStoreWithAccess(fieldset.storeId.toString(), userId);

    return fieldset;
  }

  /**
   * Update a fieldset
   */
  async update(
    userId: string,
    fieldsetId: string,
    dto: UpdateCustomFieldsetDto,
  ) {
    const fieldset = await this.fieldsetModel.findOne({
      _id: new Types.ObjectId(fieldsetId),
      isDeleted: false,
    });

    if (!fieldset) {
      throw new NotFoundException('Custom fieldset not found');
    }

    await this.getStoreWithAccess(fieldset.storeId.toString(), userId);

    const updateData: any = { ...dto };

    if (dto.productIds) {
      updateData.productIds = dto.productIds.map(
        (id) => new Types.ObjectId(id),
      );
    }
    if (dto.categoryIds) {
      updateData.categoryIds = dto.categoryIds.map(
        (id) => new Types.ObjectId(id),
      );
    }
    if (dto.tagIds) {
      updateData.tagIds = dto.tagIds.map(
        (id) => new Types.ObjectId(id),
      );
    }
    if (dto.productTypes) {
      updateData.productTypes = dto.productTypes;
    }
    if (dto.attributeIds) {
      updateData.attributeIds = dto.attributeIds.map(
        (id) => new Types.ObjectId(id),
      );
    }

    const updated = await this.fieldsetModel
      .findByIdAndUpdate(fieldsetId, updateData, { new: true })
      .populate('productIds', 'name externalId')
      .populate('categoryIds', 'name externalId')
      .populate('tagIds', 'name externalId')
      .populate('attributeIds', 'name wooId')
      .lean();

    return updated;
  }

  /**
   * Soft delete a fieldset
   */
  async delete(userId: string, fieldsetId: string) {
    const fieldset = await this.fieldsetModel.findOne({
      _id: new Types.ObjectId(fieldsetId),
      isDeleted: false,
    });

    if (!fieldset) {
      throw new NotFoundException('Custom fieldset not found');
    }

    await this.getStoreWithAccess(fieldset.storeId.toString(), userId);

    await this.fieldsetModel.findByIdAndUpdate(fieldsetId, {
      isDeleted: true,
    });

    return { message: 'Custom fieldset deleted successfully' };
  }

  /**
   * Sync a single fieldset to WooCommerce via CartFlow Bridge
   * (sends all active fieldsets so WordPress always has the full set)
   */
  async syncToWoo(userId: string, fieldsetId: string) {
    const fieldset = await this.fieldsetModel
      .findOne({
        _id: new Types.ObjectId(fieldsetId),
        isDeleted: false,
      })
      .lean();

    if (!fieldset) {
      throw new NotFoundException('Custom fieldset not found');
    }

    const store = await this.getStoreWithAccess(
      fieldset.storeId.toString(),
      userId,
    );

    // Always push ALL active fieldsets so WordPress has the complete sorted set
    const allFieldsets = await this.fieldsetModel
      .find({
        storeId: store._id,
        isDeleted: false,
        status: 'active',
      })
      .sort({ position: 1 })
      .populate('productIds', 'externalId')
      .populate('categoryIds', 'externalId')
      .populate('tagIds', 'externalId')
      .populate('attributeIds', 'wooId')
      .lean();

    return this.pushFieldsetsToWoo(store, allFieldsets);
  }

  /**
   * Sync all active fieldsets for a store to WooCommerce
   */
  async syncAllToWoo(userId: string, storeId: string) {
    const store = await this.getStoreWithAccess(storeId, userId);

    const fieldsets = await this.fieldsetModel
      .find({
        storeId: store._id,
        isDeleted: false,
        status: 'active',
      })
      .sort({ position: 1 })
      .populate('productIds', 'externalId')
      .populate('categoryIds', 'externalId')
      .populate('tagIds', 'externalId')
      .populate('attributeIds', 'wooId')
      .lean();

    return this.pushFieldsetsToWoo(store, fieldsets);
  }

  /**
   * Push fieldsets data to WordPress via CartFlow Bridge REST API
   */
  private async pushFieldsetsToWoo(store: any, fieldsets: any[]) {
    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    // Transform fieldsets to a format the WordPress plugin can store
    const payload = fieldsets.map((fs) => ({
      id: fs._id.toString(),
      name: fs.name,
      status: fs.status,
      scope: fs.scope || 'product',
      assignmentType: fs.assignmentType,
      productExternalIds: (fs.productIds || [])
        .map((p: any) => p.externalId)
        .filter(Boolean),
      categoryExternalIds: (fs.categoryIds || [])
        .map((c: any) => c.externalId)
        .filter(Boolean),
      tagExternalIds: (fs.tagIds || [])
        .map((t: any) => t.externalId)
        .filter(Boolean),
      productTypes: fs.productTypes || [],
      attributeExternalIds: (fs.attributeIds || [])
        .map((a: any) => a.wooId)
        .filter(Boolean),
      fields: fs.fields.map((f: any) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder || '',
        min: f.min ?? null,
        max: f.max ?? null,
        checkboxLabel: f.checkboxLabel || '',
        priceType: f.priceType || 'none',
        priceAmount: f.priceAmount || 0,
        conditions: (f.conditions || []).map((c: any) => ({
          fieldName: c.fieldName,
          operator: c.operator,
          value: c.value || '',
        })),
        defaultColor: f.defaultColor || '',
        minDate: f.minDate || '',
        maxDate: f.maxDate || '',
        allowedFileTypes: f.allowedFileTypes || '',
        maxFileSize: f.maxFileSize || 0,
        demoImage: f.demoImage || '',
        demoNote: f.demoNote || '',
        options: (f.options || []).map((o: any) => ({
          label: o.label,
          value: o.value,
          image: o.image || '',
          priceType: o.priceType || 'none',
          priceAmount: o.priceAmount || 0,
        })),
        position: f.position,
      })),
      position: fs.position,
    }));

    try {
      const result = await this.wooCommerceService.syncCustomFieldsets(
        credentials,
        payload,
      );

      // Update lastSyncedAt for all synced fieldsets
      const fieldsetIds = fieldsets.map((fs) => fs._id);
      await this.fieldsetModel.updateMany(
        { _id: { $in: fieldsetIds } },
        { lastSyncedAt: new Date() },
      );

      return {
        message: `Successfully synced ${fieldsets.length} fieldset(s) to WooCommerce`,
        syncedCount: fieldsets.length,
        result,
      };
    } catch (error) {
      this.logger.error(
        `Failed to sync fieldsets to WooCommerce: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Reorder fieldsets by updating their positions
   */
  async reorder(userId: string, dto: ReorderCustomFieldsetDto) {
    await this.getStoreWithAccess(dto.storeId, userId);

    const bulkOps = dto.items.map((item) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(item.id),
          storeId: new Types.ObjectId(dto.storeId),
          isDeleted: false,
        },
        update: { $set: { position: item.position } },
      },
    }));

    await this.fieldsetModel.bulkWrite(bulkOps);

    return { message: `Reordered ${dto.items.length} fieldset(s)` };
  }

  /**
   * Verify store access for the user
   */
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

    const isOwner = (store as any).ownerId?.toString() === userId;
    const isMember = (store as any).members?.some(
      (m: any) => m.userId.toString() === userId,
    );

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store as unknown as StoreDocument;
  }
}
