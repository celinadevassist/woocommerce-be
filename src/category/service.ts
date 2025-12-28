import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schema';
import { CreateCategoryDto } from './dto';
import { UpdateCategoryDto } from './dto';
import { QueryCategoryDto } from './dto';
import { ICategory, ICategoryResponse, ICategoryTree } from './interface';
import { Store, StoreDocument } from '../store/schema';
import { Organization, OrganizationDocument } from '../organization/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooCategoryFull } from '../integrations/woocommerce/woocommerce.types';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Create a new category
   */
  async create(userId: string, storeId: string, dto: CreateCategoryDto): Promise<ICategory> {
    const store = await this.getStoreWithAccess(storeId, userId);

    // Resolve parent category if provided
    let parentCategory: CategoryDocument | null = null;
    if (dto.parentId) {
      parentCategory = await this.categoryModel.findOne({
        _id: new Types.ObjectId(dto.parentId),
        storeId: store._id,
        isDeleted: false,
      });
      if (!parentCategory) {
        throw new NotFoundException('Parent category not found');
      }
    }

    // Create in WooCommerce first
    const wooData = {
      name: dto.name,
      slug: dto.slug,
      parent: parentCategory?.externalId || 0,
      description: dto.description || '',
      display: dto.display || 'default',
      image: dto.imageUrl ? { src: dto.imageUrl } : undefined,
      menu_order: dto.menuOrder || 0,
    };

    const wooCategory = await this.wooCommerceService.createCategory(
      {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      },
      wooData,
    );

    // Create in local database
    const category = await this.categoryModel.create({
      storeId: store._id,
      organizationId: store.organizationId,
      externalId: wooCategory.id,
      name: wooCategory.name,
      slug: wooCategory.slug,
      parentId: parentCategory?._id || null,
      parentExternalId: wooCategory.parent || null,
      description: wooCategory.description || '',
      display: wooCategory.display || 'default',
      image: wooCategory.image
        ? {
            id: wooCategory.image.id,
            src: wooCategory.image.src,
            name: wooCategory.image.name || '',
            alt: wooCategory.image.alt || '',
          }
        : null,
      menuOrder: wooCategory.menu_order || 0,
      count: wooCategory.count || 0,
      lastSyncedAt: new Date(),
      pendingSync: false,
    });

    return this.toInterface(category);
  }

  /**
   * Get categories with pagination and filtering
   */
  async findByStore(userId: string, query: QueryCategoryDto): Promise<ICategoryResponse> {
    if (!query.storeId) {
      throw new NotFoundException('Store ID is required');
    }

    const store = await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: store._id,
      isDeleted: false,
    };

    // Filter by parent
    if (query.parentId === 'null' || query.parentId === '') {
      filter.parentId = null;
    } else if (query.parentId) {
      filter.parentId = new Types.ObjectId(query.parentId);
    }

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

    // If tree view requested, return hierarchical structure
    if (query.tree) {
      const allCategories = await this.categoryModel
        .find({ storeId: store._id, isDeleted: false })
        .sort({ menuOrder: 1, name: 1 });

      const tree = this.buildTree(allCategories.map((c) => this.toInterface(c)));
      return {
        categories: tree,
        pagination: {
          total: allCategories.length,
          page: 1,
          size: allCategories.length,
          pages: 1,
        },
      };
    }

    const [categories, total] = await Promise.all([
      this.categoryModel.find(filter).sort({ menuOrder: 1, name: 1 }).skip(skip).limit(size),
      this.categoryModel.countDocuments(filter),
    ]);

    return {
      categories: categories.map((c) => this.toInterface(c)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single category by ID
   */
  async findById(userId: string, categoryId: string): Promise<ICategory> {
    const category = await this.categoryModel.findOne({
      _id: new Types.ObjectId(categoryId),
      isDeleted: false,
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Verify access
    await this.getStoreWithAccess(category.storeId.toString(), userId);

    return this.toInterface(category);
  }

  /**
   * Update a category
   */
  async update(userId: string, categoryId: string, dto: UpdateCategoryDto): Promise<ICategory> {
    const category = await this.categoryModel.findOne({
      _id: new Types.ObjectId(categoryId),
      isDeleted: false,
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const store = await this.getStoreWithAccess(category.storeId.toString(), userId);

    // Resolve new parent if provided
    let parentCategory: CategoryDocument | null = null;
    if (dto.parentId !== undefined) {
      if (dto.parentId === null || dto.parentId === '') {
        // Moving to root
        parentCategory = null;
      } else {
        // Prevent setting self as parent
        if (dto.parentId === categoryId) {
          throw new ConflictException('Category cannot be its own parent');
        }
        parentCategory = await this.categoryModel.findOne({
          _id: new Types.ObjectId(dto.parentId),
          storeId: store._id,
          isDeleted: false,
        });
        if (!parentCategory) {
          throw new NotFoundException('Parent category not found');
        }
        // Prevent circular reference
        if (await this.isDescendant(categoryId, dto.parentId)) {
          throw new ConflictException('Cannot set a descendant as parent');
        }
      }
    }

    // Update in WooCommerce
    const wooData: any = {};
    if (dto.name !== undefined) wooData.name = dto.name;
    if (dto.slug !== undefined) wooData.slug = dto.slug;
    if (dto.description !== undefined) wooData.description = dto.description;
    if (dto.display !== undefined) wooData.display = dto.display;
    if (dto.menuOrder !== undefined) wooData.menu_order = dto.menuOrder;
    if (dto.parentId !== undefined) {
      wooData.parent = parentCategory?.externalId || 0;
    }
    if (dto.imageUrl !== undefined) {
      wooData.image = dto.imageUrl ? { src: dto.imageUrl } : null;
    }

    const wooCategory = await this.wooCommerceService.updateCategory(
      {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      },
      category.externalId,
      wooData,
    );

    // Update local database
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.slug !== undefined) category.slug = wooCategory.slug;
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.display !== undefined) category.display = dto.display;
    if (dto.menuOrder !== undefined) category.menuOrder = dto.menuOrder;
    if (dto.parentId !== undefined) {
      category.parentId = parentCategory?._id || null;
      category.parentExternalId = parentCategory?.externalId || null;
    }
    if (dto.imageUrl !== undefined) {
      category.image = wooCategory.image
        ? {
            id: wooCategory.image.id,
            src: wooCategory.image.src,
            name: wooCategory.image.name || '',
            alt: wooCategory.image.alt || '',
          }
        : null;
    }
    category.lastSyncedAt = new Date();

    await category.save();
    return this.toInterface(category);
  }

  /**
   * Delete a category
   */
  async delete(userId: string, categoryId: string): Promise<void> {
    const category = await this.categoryModel.findOne({
      _id: new Types.ObjectId(categoryId),
      isDeleted: false,
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const store = await this.getStoreWithAccess(category.storeId.toString(), userId);

    // Check for children
    const childCount = await this.categoryModel.countDocuments({
      parentId: category._id,
      isDeleted: false,
    });

    if (childCount > 0) {
      throw new ConflictException(
        'Cannot delete category with subcategories. Delete or move subcategories first.',
      );
    }

    // Delete from WooCommerce
    await this.wooCommerceService.deleteCategory(
      {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      },
      category.externalId,
      true, // force delete
    );

    // Soft delete locally
    category.isDeleted = true;
    await category.save();
  }

  /**
   * Sync categories from WooCommerce
   */
  async syncFromWooCommerce(userId: string, storeId: string): Promise<{ synced: number; created: number; updated: number }> {
    const store = await this.getStoreWithAccess(storeId, userId);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    let allCategories: WooCategoryFull[] = [];
    let page = 1;
    let hasMore = true;

    // Fetch all categories from WooCommerce
    while (hasMore) {
      const result = await this.wooCommerceService.getCategories(credentials, page, 100);
      allCategories = allCategories.concat(result.data);
      hasMore = page < result.totalPages;
      page++;
    }

    let created = 0;
    let updated = 0;

    // First pass: Create/update all categories without parent references
    const categoryMap = new Map<number, CategoryDocument>();

    for (const wooCat of allCategories) {
      let category = await this.categoryModel.findOne({
        storeId: store._id,
        externalId: wooCat.id,
      });

      const categoryData = {
        storeId: store._id,
        organizationId: store.organizationId,
        externalId: wooCat.id,
        name: wooCat.name,
        slug: wooCat.slug,
        parentExternalId: wooCat.parent || null,
        description: wooCat.description || '',
        display: wooCat.display || 'default',
        image: wooCat.image
          ? {
              id: wooCat.image.id,
              src: wooCat.image.src,
              name: wooCat.image.name || '',
              alt: wooCat.image.alt || '',
            }
          : null,
        menuOrder: wooCat.menu_order || 0,
        count: wooCat.count || 0,
        lastSyncedAt: new Date(),
        pendingSync: false,
        isDeleted: false,
      };

      if (category) {
        Object.assign(category, categoryData);
        await category.save();
        updated++;
      } else {
        category = await this.categoryModel.create(categoryData);
        created++;
      }

      categoryMap.set(wooCat.id, category);
    }

    // Second pass: Update parent references
    for (const wooCat of allCategories) {
      if (wooCat.parent) {
        const category = categoryMap.get(wooCat.id);
        const parentCategory = categoryMap.get(wooCat.parent);
        if (category && parentCategory) {
          category.parentId = parentCategory._id;
          await category.save();
        }
      }
    }

    this.logger.log(
      `Category sync completed for store ${storeId}: ${created} created, ${updated} updated`,
    );

    return {
      synced: allCategories.length,
      created,
      updated,
    };
  }

  /**
   * Get category count for a store
   */
  async getCategoryCountByStore(storeId: string): Promise<number> {
    return this.categoryModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  // Helper methods

  private async getStoreWithAccess(storeId: string, userId: string): Promise<StoreDocument> {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(storeId),
        isDeleted: false,
      })
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify organization access
    const organization = await this.organizationModel.findOne({
      _id: store.organizationId,
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const isOwner = organization.ownerId.toString() === userId;
    const isMember = organization.members.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  private async isDescendant(categoryId: string, potentialDescendantId: string): Promise<boolean> {
    const children = await this.categoryModel.find({
      parentId: new Types.ObjectId(categoryId),
      isDeleted: false,
    });

    for (const child of children) {
      if (child._id.toString() === potentialDescendantId) {
        return true;
      }
      if (await this.isDescendant(child._id.toString(), potentialDescendantId)) {
        return true;
      }
    }

    return false;
  }

  private buildTree(categories: ICategory[]): ICategoryTree[] {
    const categoryMap = new Map<string, ICategoryTree>();
    const roots: ICategoryTree[] = [];

    // Initialize all categories with empty children
    categories.forEach((cat) => {
      categoryMap.set(cat._id, { ...cat, children: [] });
    });

    // Build tree structure
    categories.forEach((cat) => {
      const category = categoryMap.get(cat._id)!;
      if (cat.parentId) {
        const parent = categoryMap.get(cat.parentId);
        if (parent) {
          parent.children.push(category);
        } else {
          // Parent not found, treat as root
          roots.push(category);
        }
      } else {
        roots.push(category);
      }
    });

    return roots;
  }

  private toInterface(doc: CategoryDocument): ICategory {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      organizationId: obj.organizationId.toString(),
      externalId: obj.externalId,
      name: obj.name,
      slug: obj.slug,
      parentId: obj.parentId?.toString() || null,
      parentExternalId: obj.parentExternalId,
      description: obj.description,
      display: obj.display,
      image: obj.image,
      menuOrder: obj.menuOrder,
      count: obj.count,
      lastSyncedAt: obj.lastSyncedAt,
      pendingSync: obj.pendingSync,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
