import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schema';
import { ProductVariant, ProductVariantDocument } from './variant.schema';
import { UpdateProductDto, UpdateStockDto, BulkUpdateProductDto, BulkUpdateVariantDto } from './dto.update';
import { QueryProductDto } from './dto.query';
import { IProduct, IProductVariant, IProductWithVariants, IProductResponse } from './interface';
import { StockStatus } from './enum';
import { Store, StoreDocument } from '../store/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooProduct, WooProductVariation } from '../integrations/woocommerce/woocommerce.types';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Get stores user has access to
   */
  private async getUserStoreIds(userId: string): Promise<Types.ObjectId[]> {
    const stores = await this.storeModel.find({
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    }).select('_id');

    return stores.map((store) => store._id);
  }

  /**
   * Verify user has access to store
   */
  private async verifyStoreAccess(storeId: string, userId: string): Promise<StoreDocument> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  /**
   * Get products with filtering and pagination
   */
  async findAll(userId: string, query: QueryProductDto): Promise<IProductResponse> {
    // Get stores user has access to
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    // Apply filters
    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.stockStatus) {
      filter.stockStatus = query.stockStatus;
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.categoryId) {
      filter['categories.externalId'] = query.categoryId;
    }
    if (query.pendingSync) {
      filter.pendingSync = true;
    }
    if (query.lowStock) {
      filter.$expr = {
        $and: [
          { $eq: ['$manageStock', true] },
          { $ne: ['$stockQuantity', null] },
          { $lte: ['$stockQuantity', { $ifNull: ['$lowStockAmount', 10] }] },
        ],
      };
    }
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { sku: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [products, total] = await Promise.all([
      this.productModel.find(filter).sort(sort).skip(skip).limit(size),
      this.productModel.countDocuments(filter),
    ]);

    return {
      products: products.map((p) => this.toProductInterface(p)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get product by ID with variants
   */
  async findById(id: string, userId: string): Promise<IProductWithVariants> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Verify user has access to store
    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Get variants if it's a variable product
    const variants = await this.variantModel.find({
      productId: product._id,
      isDeleted: false,
    });

    return {
      ...this.toProductInterface(product),
      variants: variants.map((v) => this.toVariantInterface(v)),
    };
  }

  /**
   * Update product locally and optionally push to WooCommerce
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateProductDto,
    pushToWoo: boolean = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Update local product
    if (dto.name) product.name = dto.name;
    if (dto.description) product.description = dto.description;
    if (dto.shortDescription) product.shortDescription = dto.shortDescription;
    if (dto.regularPrice) product.regularPrice = dto.regularPrice;
    if (dto.salePrice !== undefined) product.salePrice = dto.salePrice;
    if (dto.sku) product.sku = dto.sku;
    if (dto.status) product.status = dto.status;
    if (dto.manageStock !== undefined) product.manageStock = dto.manageStock;
    if (dto.stockQuantity !== undefined) product.stockQuantity = dto.stockQuantity;
    if (dto.stockStatus) product.stockStatus = dto.stockStatus;
    if (dto.lowStockAmount !== undefined) product.lowStockAmount = dto.lowStockAmount;

    // Mark for sync if not pushing immediately
    product.pendingSync = !pushToWoo;

    await product.save();

    // Push to WooCommerce
    if (pushToWoo) {
      await this.syncProductToWoo(product);
    }

    return this.toProductInterface(product);
  }

  /**
   * Update product stock
   */
  async updateStock(
    id: string,
    userId: string,
    dto: UpdateStockDto,
    pushToWoo: boolean = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Update stock
    product.manageStock = true;
    product.stockQuantity = dto.quantity;

    // Update stock status based on quantity
    if (dto.quantity === 0) {
      product.stockStatus = StockStatus.OUT_OF_STOCK;
    } else if (product.lowStockAmount && dto.quantity <= product.lowStockAmount) {
      product.stockStatus = StockStatus.IN_STOCK; // Still in stock, but low
    } else {
      product.stockStatus = StockStatus.IN_STOCK;
    }

    product.pendingSync = !pushToWoo;
    await product.save();

    // Push to WooCommerce
    if (pushToWoo) {
      await this.syncStockToWoo(product);
    }

    return this.toProductInterface(product);
  }

  /**
   * Bulk update multiple products
   */
  async bulkUpdate(
    userId: string,
    dto: BulkUpdateProductDto,
    pushToWoo: boolean = true,
  ): Promise<{ updated: number; failed: number; results: { id: string; success: boolean; error?: string }[] }> {
    const results: { id: string; success: boolean; error?: string }[] = [];
    let updated = 0;
    let failed = 0;

    for (const productId of dto.productIds) {
      try {
        const product = await this.productModel.findOne({
          _id: new Types.ObjectId(productId),
          isDeleted: false,
        });

        if (!product) {
          results.push({ id: productId, success: false, error: 'Product not found' });
          failed++;
          continue;
        }

        await this.verifyStoreAccess(product.storeId.toString(), userId);

        // Apply updates
        if (dto.status !== undefined) {
          product.status = dto.status;
        }
        if (dto.manageStock !== undefined) {
          product.manageStock = dto.manageStock;
        }
        if (dto.stockQuantity !== undefined) {
          product.stockQuantity = dto.stockQuantity;
          if (dto.stockQuantity === 0) {
            product.stockStatus = StockStatus.OUT_OF_STOCK;
          } else {
            product.stockStatus = StockStatus.IN_STOCK;
          }
        }
        if (dto.stockStatus !== undefined) {
          product.stockStatus = dto.stockStatus;
        }
        if (dto.lowStockAmount !== undefined) {
          product.lowStockAmount = dto.lowStockAmount;
        }
        if (dto.regularPrice !== undefined) {
          product.regularPrice = dto.regularPrice;
        }
        if (dto.salePrice !== undefined) {
          product.salePrice = dto.salePrice;
        }

        if (dto.priceAdjustment) {
          const currentPrice = parseFloat(product.regularPrice || '0');
          let adjustment = dto.priceAdjustment.value;

          if (dto.priceAdjustment.method === 'percentage') {
            adjustment = currentPrice * (dto.priceAdjustment.value / 100);
          }

          if (dto.priceAdjustment.type === 'increase') {
            product.regularPrice = (currentPrice + adjustment).toFixed(2);
          } else {
            product.regularPrice = Math.max(0, currentPrice - adjustment).toFixed(2);
          }
        }

        product.pendingSync = !pushToWoo;
        await product.save();

        if (pushToWoo && product.externalId) {
          try {
            await this.syncProductToWoo(product);
          } catch (syncError) {
            this.logger.warn(`Failed to sync product ${productId} to WooCommerce: ${syncError.message}`);
          }
        }

        results.push({ id: productId, success: true });
        updated++;
      } catch (error) {
        results.push({ id: productId, success: false, error: error.message });
        failed++;
      }
    }

    return { updated, failed, results };
  }

  /**
   * Bulk update multiple variants
   */
  async bulkUpdateVariants(
    userId: string,
    dto: BulkUpdateVariantDto,
    pushToWoo: boolean = true,
  ): Promise<{ updated: number; failed: number; results: { id: string; success: boolean; error?: string }[] }> {
    const results: { id: string; success: boolean; error?: string }[] = [];
    let updated = 0;
    let failed = 0;

    for (const variantId of dto.variantIds) {
      try {
        const variant = await this.variantModel.findOne({
          _id: new Types.ObjectId(variantId),
          isDeleted: false,
        });

        if (!variant) {
          results.push({ id: variantId, success: false, error: 'Variant not found' });
          failed++;
          continue;
        }

        await this.verifyStoreAccess(variant.storeId.toString(), userId);

        if (dto.status !== undefined) {
          variant.status = dto.status;
        }
        if (dto.manageStock !== undefined) {
          variant.manageStock = dto.manageStock;
        }
        if (dto.stockQuantity !== undefined) {
          variant.stockQuantity = dto.stockQuantity;
          if (dto.stockQuantity === 0) {
            variant.stockStatus = StockStatus.OUT_OF_STOCK;
          } else {
            variant.stockStatus = StockStatus.IN_STOCK;
          }
        }
        if (dto.stockStatus !== undefined) {
          variant.stockStatus = dto.stockStatus;
        }
        if (dto.regularPrice !== undefined) {
          variant.regularPrice = dto.regularPrice;
        }
        if (dto.salePrice !== undefined) {
          variant.salePrice = dto.salePrice;
        }

        if (dto.priceAdjustment) {
          const currentPrice = parseFloat(variant.regularPrice || '0');
          let adjustment = dto.priceAdjustment.value;

          if (dto.priceAdjustment.method === 'percentage') {
            adjustment = currentPrice * (dto.priceAdjustment.value / 100);
          }

          if (dto.priceAdjustment.type === 'increase') {
            variant.regularPrice = (currentPrice + adjustment).toFixed(2);
          } else {
            variant.regularPrice = Math.max(0, currentPrice - adjustment).toFixed(2);
          }
        }

        variant.pendingSync = !pushToWoo;
        await variant.save();

        if (pushToWoo && variant.externalId) {
          try {
            await this.syncVariantToWoo(variant);
          } catch (syncError) {
            this.logger.warn(`Failed to sync variant ${variantId} to WooCommerce: ${syncError.message}`);
          }
        }

        results.push({ id: variantId, success: true });
        updated++;
      } catch (error) {
        results.push({ id: variantId, success: false, error: error.message });
        failed++;
      }
    }

    return { updated, failed, results };
  }

  /**
   * Sync variant changes to WooCommerce
   */
  async syncVariantToWoo(variant: ProductVariantDocument): Promise<void> {
    const product = await this.productModel.findById(variant.productId);
    if (!product) {
      throw new NotFoundException('Parent product not found');
    }

    const store = await this.storeModel
      .findById(variant.storeId)
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    await this.wooCommerceService.updateVariation(credentials, product.externalId, variant.externalId, {
      regular_price: variant.regularPrice,
      sale_price: variant.salePrice,
      sku: variant.sku,
      status: variant.status as 'publish' | 'pending' | 'draft' | 'private',
      manage_stock: variant.manageStock,
      stock_quantity: variant.stockQuantity,
      stock_status: variant.stockStatus as 'instock' | 'outofstock' | 'onbackorder',
    });

    variant.pendingSync = false;
    variant.lastSyncedAt = new Date();
    await variant.save();
  }

  /**
   * Get all unique variant attributes for filtering
   */
  async getVariantAttributes(
    userId: string,
    storeId?: string,
  ): Promise<{ [attributeName: string]: string[] }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    const result = await this.variantModel.aggregate([
      { $match: filter },
      { $unwind: '$attributes' },
      {
        $group: {
          _id: {
            name: '$attributes.name',
            option: '$attributes.option',
          },
        },
      },
      {
        $group: {
          _id: '$_id.name',
          options: { $addToSet: '$_id.option' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const attributes: { [key: string]: string[] } = {};
    result.forEach((item: { _id: string; options: string[] }) => {
      attributes[item._id] = item.options.sort();
    });

    return attributes;
  }

  /**
   * Search variants by attributes
   */
  async searchVariantsByAttributes(
    userId: string,
    storeId: string,
    attributeFilters: { name: string; values: string[] }[],
  ): Promise<{ variants: IProductVariant[]; total: number }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    if (attributeFilters && attributeFilters.length > 0) {
      filter.$and = attributeFilters.map((attrFilter) => ({
        attributes: {
          $elemMatch: {
            name: attrFilter.name,
            option: { $in: attrFilter.values },
          },
        },
      }));
    }

    const variants = await this.variantModel
      .find(filter)
      .populate('productId', 'name')
      .limit(500);

    return {
      variants: variants.map((v) => this.toVariantInterface(v)),
      total: variants.length,
    };
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(
    userId: string,
    storeId?: string,
    threshold?: number,
  ): Promise<IProduct[]> {
    const storeIds = await this.getUserStoreIds(userId);
    const lowThreshold = threshold || 10;

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
      manageStock: true,
      stockQuantity: { $ne: null, $lte: lowThreshold },
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    const products = await this.productModel.find(filter).sort({ stockQuantity: 1 }).limit(100);

    return products.map((p) => this.toProductInterface(p));
  }

  /**
   * Sync product changes to WooCommerce
   */
  async syncProductToWoo(product: ProductDocument): Promise<void> {
    const store = await this.storeModel
      .findById(product.storeId)
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    await this.wooCommerceService.updateProduct(credentials, product.externalId, {
      name: product.name,
      description: product.description,
      short_description: product.shortDescription,
      regular_price: product.regularPrice,
      sale_price: product.salePrice,
      sku: product.sku,
      status: product.status,
      manage_stock: product.manageStock,
      stock_quantity: product.stockQuantity,
      stock_status: product.stockStatus,
    });

    product.pendingSync = false;
    product.lastSyncedAt = new Date();
    await product.save();
  }

  /**
   * Sync stock to WooCommerce
   */
  async syncStockToWoo(product: ProductDocument): Promise<void> {
    const store = await this.storeModel
      .findById(product.storeId)
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    await this.wooCommerceService.updateStock(
      credentials,
      product.externalId,
      product.stockQuantity || 0,
    );

    product.pendingSync = false;
    product.lastSyncedAt = new Date();
    await product.save();
  }

  /**
   * Create or update product from WooCommerce data (used during sync)
   */
  async upsertFromWoo(
    storeId: string,
    wooProduct: WooProduct,
  ): Promise<ProductDocument> {
    const existingProduct = await this.productModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: wooProduct.id,
    });

    const productData = {
      storeId: new Types.ObjectId(storeId),
      externalId: wooProduct.id,
      sku: wooProduct.sku,
      name: wooProduct.name,
      slug: wooProduct.slug,
      permalink: wooProduct.permalink,
      type: wooProduct.type,
      status: wooProduct.status,
      featured: wooProduct.featured,
      catalogVisibility: wooProduct.catalog_visibility,
      description: wooProduct.description,
      shortDescription: wooProduct.short_description,
      price: wooProduct.price,
      regularPrice: wooProduct.regular_price,
      salePrice: wooProduct.sale_price,
      onSale: wooProduct.on_sale,
      purchasable: wooProduct.purchasable,
      totalSales: wooProduct.total_sales,
      virtual: wooProduct.virtual,
      downloadable: wooProduct.downloadable,
      manageStock: wooProduct.manage_stock,
      stockQuantity: wooProduct.stock_quantity,
      stockStatus: wooProduct.stock_status,
      lowStockAmount: wooProduct.low_stock_amount,
      weight: wooProduct.weight,
      dimensions: wooProduct.dimensions,
      categories: wooProduct.categories,
      tags: wooProduct.tags,
      images: wooProduct.images.map((img, idx) => ({
        externalId: img.id,
        src: img.src,
        name: img.name,
        alt: img.alt,
        position: idx,
      })),
      attributes: wooProduct.attributes,
      variationIds: wooProduct.variations,
      variationCount: wooProduct.variations?.length || 0,
      parentId: wooProduct.parent_id,
      dateCreatedWoo: new Date(wooProduct.date_created),
      dateModifiedWoo: new Date(wooProduct.date_modified),
      lastSyncedAt: new Date(),
      pendingSync: false,
      isDeleted: false,
    };

    if (existingProduct) {
      Object.assign(existingProduct, productData);
      await existingProduct.save();
      return existingProduct;
    }

    return await this.productModel.create(productData);
  }

  /**
   * Create or update variant from WooCommerce data
   */
  async upsertVariantFromWoo(
    productId: string,
    storeId: string,
    parentExternalId: number,
    wooVariant: WooProductVariation,
  ): Promise<ProductVariantDocument> {
    const existingVariant = await this.variantModel.findOne({
      storeId: new Types.ObjectId(storeId),
      externalId: wooVariant.id,
    });

    const variantData = {
      productId: new Types.ObjectId(productId),
      storeId: new Types.ObjectId(storeId),
      externalId: wooVariant.id,
      parentExternalId,
      sku: wooVariant.sku,
      permalink: wooVariant.permalink,
      description: wooVariant.description,
      price: wooVariant.price,
      regularPrice: wooVariant.regular_price,
      salePrice: wooVariant.sale_price,
      onSale: wooVariant.on_sale,
      status: wooVariant.status,
      purchasable: wooVariant.purchasable,
      virtual: wooVariant.virtual,
      downloadable: wooVariant.downloadable,
      manageStock: wooVariant.manage_stock,
      stockQuantity: wooVariant.stock_quantity,
      stockStatus: wooVariant.stock_status,
      weight: wooVariant.weight,
      dimensions: wooVariant.dimensions,
      image: wooVariant.image
        ? {
            externalId: wooVariant.image.id,
            src: wooVariant.image.src,
            name: wooVariant.image.name,
            alt: wooVariant.image.alt,
            position: 0,
          }
        : undefined,
      attributes: wooVariant.attributes,
      dateCreatedWoo: new Date(wooVariant.date_created),
      dateModifiedWoo: new Date(wooVariant.date_modified),
      lastSyncedAt: new Date(),
      pendingSync: false,
      isDeleted: false,
    };

    if (existingVariant) {
      Object.assign(existingVariant, variantData);
      await existingVariant.save();
      return existingVariant;
    }

    return await this.variantModel.create(variantData);
  }

  /**
   * Get product count by store
   */
  async getProductCountByStore(storeId: string): Promise<number> {
    return this.productModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });
  }

  /**
   * Export products to CSV
   */
  async exportToCsv(userId: string, query: QueryProductDto): Promise<string> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.stockStatus) {
      filter.stockStatus = query.stockStatus;
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { sku: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const products = await this.productModel
      .find(filter)
      .sort({ name: 1 })
      .limit(10000);

    const headers = [
      'Name',
      'SKU',
      'Type',
      'Status',
      'Regular Price',
      'Sale Price',
      'Stock Status',
      'Stock Quantity',
      'Categories',
      'Description',
      'Created Date',
    ];

    const rows = products.map((product) => {
      return [
        product.name || '',
        product.sku || '',
        product.type || '',
        product.status || '',
        product.regularPrice || '',
        product.salePrice || '',
        product.stockStatus || '',
        product.stockQuantity ?? '',
        (product.categories || []).map((c: any) => c.name).join('; '),
        (product.shortDescription || '').replace(/<[^>]+>/g, '').substring(0, 200),
        product.dateCreatedWoo
          ? new Date(product.dateCreatedWoo).toISOString().split('T')[0]
          : '',
      ];
    });

    const escapeValue = (val: any): string => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.map(escapeValue).join(','),
      ...rows.map((row) => row.map(escapeValue).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Get product analytics and insights
   */
  async getAnalytics(
    userId: string,
    storeId?: string,
  ): Promise<{
    overview: { totalProducts: number; activeProducts: number; draftProducts: number; outOfStock: number; lowStock: number };
    stockDistribution: { inStock: number; outOfStock: number; onBackorder: number; lowStock: number };
    categoryBreakdown: { categoryName: string; productCount: number; avgPrice: number }[];
    priceRanges: { range: string; count: number }[];
    topRatedProducts: { productId: string; name: string; avgRating: number; reviewCount: number; image?: string }[];
    recentlyAdded: { productId: string; name: string; dateAdded: Date; status: string; image?: string }[];
    stockAlerts: { productId: string; name: string; sku: string; stockQuantity: number; threshold: number; image?: string }[];
    typeDistribution: { type: string; count: number }[];
    priceStats: { minPrice: number; maxPrice: number; avgPrice: number; totalValue: number };
  }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    const [
      totalProducts,
      activeProducts,
      draftProducts,
      outOfStock,
      lowStockCount,
    ] = await Promise.all([
      this.productModel.countDocuments(filter),
      this.productModel.countDocuments({ ...filter, status: 'publish' }),
      this.productModel.countDocuments({ ...filter, status: 'draft' }),
      this.productModel.countDocuments({ ...filter, stockStatus: StockStatus.OUT_OF_STOCK }),
      this.productModel.countDocuments({
        ...filter,
        manageStock: true,
        $expr: { $lte: ['$stockQuantity', { $ifNull: ['$lowStockAmount', 10] }] },
      }),
    ]);

    const [inStock, onBackorder] = await Promise.all([
      this.productModel.countDocuments({ ...filter, stockStatus: StockStatus.IN_STOCK }),
      this.productModel.countDocuments({ ...filter, stockStatus: StockStatus.ON_BACKORDER }),
    ]);

    const categoryAgg = await this.productModel.aggregate([
      { $match: filter },
      { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
      {
        $addFields: {
          priceNum: {
            $convert: {
              input: { $ifNull: ['$regularPrice', '0'] },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: '$categories.name',
          productCount: { $sum: 1 },
          avgPrice: { $avg: '$priceNum' },
        },
      },
      { $sort: { productCount: -1 } },
      { $limit: 10 },
    ]);

    const categoryBreakdown = categoryAgg.map((c) => ({
      categoryName: c._id || 'Uncategorized',
      productCount: c.productCount,
      avgPrice: Math.round(c.avgPrice * 100) / 100,
    }));

    const priceRanges = await this.productModel.aggregate([
      { $match: filter },
      {
        $addFields: {
          priceNum: {
            $convert: {
              input: { $ifNull: ['$regularPrice', '0'] },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      {
        $bucket: {
          groupBy: '$priceNum',
          boundaries: [0, 50, 100, 250, 500, 1000, 5000, Infinity],
          default: 'Other',
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    const priceRangeLabels: Record<string, string> = {
      '0': '$0 - $50',
      '50': '$50 - $100',
      '100': '$100 - $250',
      '250': '$250 - $500',
      '500': '$500 - $1000',
      '1000': '$1000 - $5000',
      '5000': '$5000+',
      'Other': 'Other',
    };

    const formattedPriceRanges = priceRanges.map((p) => ({
      range: priceRangeLabels[String(p._id)] || String(p._id),
      count: p.count,
    }));

    const topRatedProducts = await this.productModel
      .find({ ...filter, ratingCount: { $gt: 0 } })
      .sort({ averageRating: -1, ratingCount: -1 })
      .limit(5)
      .select('name averageRating ratingCount images');

    const recentlyAdded = await this.productModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt status images');

    const stockAlerts = await this.productModel
      .find({
        ...filter,
        manageStock: true,
        stockQuantity: { $ne: null },
        $expr: { $lte: ['$stockQuantity', { $ifNull: ['$lowStockAmount', 10] }] },
      })
      .sort({ stockQuantity: 1 })
      .limit(10)
      .select('name sku stockQuantity lowStockAmount images');

    const typeDistribution = await this.productModel.aggregate([
      { $match: filter },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const priceStats = await this.productModel.aggregate([
      { $match: { ...filter, regularPrice: { $exists: true, $ne: '' } } },
      {
        $addFields: {
          priceNum: {
            $convert: {
              input: '$regularPrice',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
          stockNum: { $ifNull: ['$stockQuantity', 0] },
        },
      },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$priceNum' },
          maxPrice: { $max: '$priceNum' },
          avgPrice: { $avg: '$priceNum' },
          totalValue: { $sum: { $multiply: ['$priceNum', '$stockNum'] } },
        },
      },
    ]);

    const stats = priceStats[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0, totalValue: 0 };

    return {
      overview: {
        totalProducts,
        activeProducts,
        draftProducts,
        outOfStock,
        lowStock: lowStockCount,
      },
      stockDistribution: {
        inStock,
        outOfStock,
        onBackorder,
        lowStock: lowStockCount,
      },
      categoryBreakdown,
      priceRanges: formattedPriceRanges,
      topRatedProducts: topRatedProducts.map((p) => ({
        productId: p._id.toString(),
        name: p.name,
        avgRating: p.averageRating || 0,
        reviewCount: p.ratingCount || 0,
        image: p.images?.[0]?.src,
      })),
      recentlyAdded: recentlyAdded.map((p) => ({
        productId: p._id.toString(),
        name: p.name,
        dateAdded: p.createdAt,
        status: p.status,
        image: p.images?.[0]?.src,
      })),
      stockAlerts: stockAlerts.map((p) => ({
        productId: p._id.toString(),
        name: p.name,
        sku: p.sku || '',
        stockQuantity: p.stockQuantity || 0,
        threshold: p.lowStockAmount || 10,
        image: p.images?.[0]?.src,
      })),
      typeDistribution: typeDistribution.map((t) => ({
        type: t._id || 'Unknown',
        count: t.count,
      })),
      priceStats: {
        minPrice: Math.round((stats.minPrice || 0) * 100) / 100,
        maxPrice: Math.round((stats.maxPrice || 0) * 100) / 100,
        avgPrice: Math.round((stats.avgPrice || 0) * 100) / 100,
        totalValue: Math.round((stats.totalValue || 0) * 100) / 100,
      },
    };
  }

  /**
   * Get all variants with filtering and pagination
   */
  async findAllVariants(
    userId: string,
    query: {
      storeId?: string;
      productId?: string;
      keyword?: string;
      stockStatus?: string;
      status?: string;
      lowStock?: boolean;
      minPrice?: number;
      maxPrice?: number;
      attributes?: { name: string; values: string[] }[];
      page?: number;
      size?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<{
    variants: (IProductVariant & { productName?: string })[];
    pagination: { total: number; page: number; size: number; pages: number };
  }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.productId) {
      filter.productId = new Types.ObjectId(query.productId);
    }
    if (query.stockStatus) {
      filter.stockStatus = query.stockStatus;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.lowStock) {
      filter.$expr = {
        $and: [
          { $eq: ['$manageStock', true] },
          { $ne: ['$stockQuantity', null] },
          { $lte: ['$stockQuantity', 10] },
        ],
      };
    }
    if (query.keyword) {
      filter.$or = [
        { sku: { $regex: query.keyword, $options: 'i' } },
        { 'attributes.option': { $regex: query.keyword, $options: 'i' } },
      ];
    }

    // Price range filter
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.$expr = filter.$expr || { $and: [] };
      if (!Array.isArray(filter.$expr.$and)) {
        filter.$expr = { $and: [filter.$expr] };
      }

      // Convert price string to number for comparison
      if (query.minPrice !== undefined) {
        filter.$expr.$and.push({
          $gte: [{ $toDouble: { $ifNull: ['$price', '$regularPrice'] } }, query.minPrice],
        });
      }
      if (query.maxPrice !== undefined) {
        filter.$expr.$and.push({
          $lte: [{ $toDouble: { $ifNull: ['$price', '$regularPrice'] } }, query.maxPrice],
        });
      }
    }

    // Attribute filters (e.g., Color: Red, Size: L)
    if (query.attributes && query.attributes.length > 0) {
      const attrConditions = query.attributes.map((attr) => ({
        attributes: {
          $elemMatch: {
            name: { $regex: `^${attr.name}$`, $options: 'i' },
            option: { $in: attr.values },
          },
        },
      }));

      if (attrConditions.length === 1) {
        Object.assign(filter, attrConditions[0]);
      } else {
        filter.$and = filter.$and || [];
        filter.$and.push(...attrConditions);
      }
    }

    const page = query.page || 1;
    const size = query.size || 50;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [variants, total] = await Promise.all([
      this.variantModel.find(filter).sort(sort).skip(skip).limit(size),
      this.variantModel.countDocuments(filter),
    ]);

    const productIds = [...new Set(variants.map((v) => v.productId.toString()))];
    const products = await this.productModel.find({
      _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    }).select('_id name');

    const productNameMap = new Map<string, string>();
    products.forEach((p) => {
      productNameMap.set(p._id.toString(), p.name);
    });

    const variantsWithNames = variants.map((v) => ({
      ...this.toVariantInterface(v),
      productName: productNameMap.get(v.productId.toString()) || '',
    }));

    return {
      variants: variantsWithNames,
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  private toProductInterface(doc: ProductDocument): IProduct {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      externalId: obj.externalId,
      sku: obj.sku,
      name: obj.name,
      slug: obj.slug,
      permalink: obj.permalink,
      type: obj.type,
      status: obj.status,
      featured: obj.featured,
      catalogVisibility: obj.catalogVisibility,
      description: obj.description,
      shortDescription: obj.shortDescription,
      price: obj.price,
      regularPrice: obj.regularPrice,
      salePrice: obj.salePrice,
      onSale: obj.onSale,
      purchasable: obj.purchasable,
      totalSales: obj.totalSales,
      virtual: obj.virtual,
      downloadable: obj.downloadable,
      manageStock: obj.manageStock,
      stockQuantity: obj.stockQuantity,
      stockStatus: obj.stockStatus,
      lowStockAmount: obj.lowStockAmount,
      weight: obj.weight,
      dimensions: obj.dimensions,
      categories: obj.categories,
      tags: obj.tags,
      images: obj.images,
      attributes: obj.attributes,
      variationIds: obj.variationIds,
      variationCount: obj.variationCount,
      parentId: obj.parentId,
      lastSyncedAt: obj.lastSyncedAt,
      pendingSync: obj.pendingSync,
      averageRating: obj.averageRating || 0,
      ratingCount: obj.ratingCount || 0,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private toVariantInterface(doc: ProductVariantDocument): IProductVariant {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      productId: obj.productId.toString(),
      storeId: obj.storeId.toString(),
      externalId: obj.externalId,
      parentExternalId: obj.parentExternalId,
      sku: obj.sku,
      permalink: obj.permalink,
      description: obj.description,
      price: obj.price,
      regularPrice: obj.regularPrice,
      salePrice: obj.salePrice,
      onSale: obj.onSale,
      status: obj.status,
      purchasable: obj.purchasable,
      virtual: obj.virtual,
      downloadable: obj.downloadable,
      manageStock: obj.manageStock,
      stockQuantity: obj.stockQuantity,
      stockStatus: obj.stockStatus,
      weight: obj.weight,
      dimensions: obj.dimensions,
      image: obj.image,
      attributes: obj.attributes,
      lastSyncedAt: obj.lastSyncedAt,
      pendingSync: obj.pendingSync,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  // ==================== IMAGE MANAGEMENT ====================

  async updateImages(
    id: string,
    userId: string,
    images: { src: string; alt?: string; name?: string; position?: number }[],
    pushToWoo: boolean = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    product.images = images.map((img, index) => ({
      src: img.src,
      alt: img.alt || '',
      name: img.name || '',
      position: img.position !== undefined ? img.position : index,
    }));

    product.pendingSync = !pushToWoo;
    await product.save();

    if (pushToWoo) {
      await this.syncImagesToWoo(product);
    }

    return this.toProductInterface(product);
  }

  async deleteImage(
    id: string,
    userId: string,
    imageIndex: number,
    pushToWoo: boolean = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    if (imageIndex < 0 || imageIndex >= product.images.length) {
      throw new BadRequestException('Invalid image index');
    }

    product.images.splice(imageIndex, 1);
    product.images.forEach((img, idx) => {
      img.position = idx;
    });

    product.pendingSync = !pushToWoo;
    await product.save();

    if (pushToWoo) {
      await this.syncImagesToWoo(product);
    }

    return this.toProductInterface(product);
  }

  private async syncImagesToWoo(product: ProductDocument): Promise<void> {
    const store = await this.storeModel
      .findById(product.storeId)
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    await this.wooCommerceService.updateProduct(credentials, product.externalId, {
      images: product.images.map((img) => ({
        src: img.src,
        alt: img.alt,
      })),
    });

    product.pendingSync = false;
    product.lastSyncedAt = new Date();
    await product.save();
  }

  // ==================== CSV IMPORT ====================

  async importFromCsv(
    userId: string,
    storeId: string,
    csvContent: string,
  ): Promise<{
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors: { row: number; error: string }[];
  }> {
    const store = await this.storeModel
      .findById(storeId)
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    await this.verifyStoreAccess(storeId, userId);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    const lines = csvContent.split('\n').map((line) => line.trim()).filter((line) => line);
    if (lines.length < 2) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const dataRows = lines.slice(1);

    const results = {
      total: dataRows.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
    };

    const getColumn = (row: string[], headerName: string): string => {
      const index = headers.indexOf(headerName.toLowerCase());
      return index >= 0 ? (row[index] || '').trim() : '';
    };

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2;
      try {
        const row = this.parseCsvLine(dataRows[i]);
        const name = getColumn(row, 'name');

        if (!name) {
          results.errors.push({ row: rowNumber, error: 'Name is required' });
          results.failed++;
          continue;
        }

        const sku = getColumn(row, 'sku');
        const type = getColumn(row, 'type') || 'simple';
        const status = getColumn(row, 'status') || 'publish';
        const regularPrice = getColumn(row, 'regular price');
        const salePrice = getColumn(row, 'sale price');
        const manageStock = ['yes', 'true', '1'].includes(getColumn(row, 'manage stock').toLowerCase());
        const stockQuantity = parseInt(getColumn(row, 'stock quantity'), 10) || 0;
        const description = getColumn(row, 'description');
        const shortDescription = getColumn(row, 'short description');

        let existingProduct = null;
        if (sku) {
          existingProduct = await this.productModel.findOne({
            storeId: new Types.ObjectId(storeId),
            sku,
            isDeleted: false,
          });
        }

        const productData: any = {
          name,
          type,
          status,
          regular_price: regularPrice,
          sale_price: salePrice || undefined,
          sku: sku || undefined,
          manage_stock: manageStock,
          stock_quantity: manageStock ? stockQuantity : undefined,
          description: description || undefined,
          short_description: shortDescription || undefined,
        };

        let wooProduct;
        if (existingProduct) {
          wooProduct = await this.wooCommerceService.updateProduct(
            credentials,
            existingProduct.externalId,
            productData,
          );
          results.updated++;
        } else {
          wooProduct = await this.wooCommerceService.createProduct(credentials, productData);
          results.created++;
        }

        await this.upsertProductFromWoo(wooProduct, store);

      } catch (error) {
        this.logger.error(`Import error row ${rowNumber}: ${error.message}`);
        results.errors.push({ row: rowNumber, error: error.message });
        results.failed++;
      }
    }

    return results;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  private async upsertProductFromWoo(wooProduct: WooProduct, store: StoreDocument): Promise<void> {
    const productData = {
      storeId: store._id,
      externalId: wooProduct.id,
      sku: wooProduct.sku,
      name: wooProduct.name,
      slug: wooProduct.slug,
      permalink: wooProduct.permalink,
      type: wooProduct.type,
      status: wooProduct.status,
      featured: wooProduct.featured,
      catalogVisibility: wooProduct.catalog_visibility,
      description: wooProduct.description,
      shortDescription: wooProduct.short_description,
      price: wooProduct.price,
      regularPrice: wooProduct.regular_price,
      salePrice: wooProduct.sale_price,
      onSale: wooProduct.on_sale,
      purchasable: wooProduct.purchasable,
      totalSales: wooProduct.total_sales,
      virtual: wooProduct.virtual,
      downloadable: wooProduct.downloadable,
      manageStock: wooProduct.manage_stock,
      stockQuantity: wooProduct.stock_quantity,
      stockStatus: wooProduct.stock_status,
      lowStockAmount: wooProduct.low_stock_amount,
      weight: wooProduct.weight,
      dimensions: wooProduct.dimensions,
      categories: wooProduct.categories?.map((cat) => ({
        externalId: cat.id,
        name: cat.name,
        slug: cat.slug,
      })) || [],
      tags: wooProduct.tags?.map((tag) => ({
        externalId: tag.id,
        name: tag.name,
        slug: tag.slug,
      })) || [],
      images: wooProduct.images?.map((img, idx) => ({
        externalId: img.id,
        src: img.src,
        name: img.name,
        alt: img.alt,
        position: idx,
      })) || [],
      attributes: wooProduct.attributes?.map((attr) => ({
        externalId: attr.id,
        name: attr.name,
        position: attr.position,
        visible: attr.visible,
        variation: attr.variation,
        options: attr.options,
      })) || [],
      variationIds: wooProduct.variations || [],
      variationCount: wooProduct.variations?.length || 0,
      parentId: wooProduct.parent_id,
      dateCreatedWoo: wooProduct.date_created ? new Date(wooProduct.date_created) : undefined,
      dateModifiedWoo: wooProduct.date_modified ? new Date(wooProduct.date_modified) : undefined,
      lastSyncedAt: new Date(),
      pendingSync: false,
      isDeleted: false,
    };

    await this.productModel.findOneAndUpdate(
      { storeId: store._id, externalId: wooProduct.id },
      productData,
      { upsert: true, new: true },
    );
  }
}
