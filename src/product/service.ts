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
import { UpdateProductDto, UpdateStockDto, BulkUpdateProductDto, BulkUpdateVariantDto, CreateProductDto, UpdateVariantDto } from './dto.update';
import { QueryProductDto } from './dto.query';
import { IProduct, IProductVariant, IProductWithVariants, IProductResponse } from './interface';
import { StockStatus } from './enum';
import { Store, StoreDocument } from '../store/schema';
import { Category, CategoryDocument } from '../category/schema';
import { Tag, TagDocument } from '../tag/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { WooProduct, WooProductVariation } from '../integrations/woocommerce/woocommerce.types';
import { S3UploadService } from '../modules/s3-upload/s3-upload.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name) private variantModel: Model<ProductVariantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Tag.name) private tagModel: Model<TagDocument>,
    private readonly wooCommerceService: WooCommerceService,
    private readonly s3UploadService: S3UploadService,
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
      // Support both externalId (number) and slug (string) for filtering
      const catId = Number(query.categoryId);
      if (!isNaN(catId)) {
        filter['categories.externalId'] = catId;
      } else {
        filter['categories.slug'] = query.categoryId;
      }
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
   * Create a new product locally and push to WooCommerce
   */
  async create(
    userId: string,
    dto: CreateProductDto,
    pushToWoo: boolean = true,
  ): Promise<IProduct> {
    // Verify user has access to store
    await this.verifyStoreAccess(dto.storeId, userId);

    // Prepare WooCommerce product data
    const wooProductData: any = {
      name: dto.name,
      type: dto.type || 'simple',
      status: dto.status || 'draft',
      featured: dto.featured ?? false,
      catalog_visibility: dto.catalogVisibility || 'visible',
      description: dto.description || '',
      short_description: dto.shortDescription || '',
      sku: dto.sku || '',
      regular_price: dto.regularPrice || '',
      sale_price: dto.salePrice || '',
      manage_stock: dto.manageStock ?? false,
      stock_quantity: dto.stockQuantity,
      stock_status: dto.stockStatus || 'instock',
      weight: dto.weight || '',
      categories: dto.categories?.map((id) => ({ id })) || [],
      tags: dto.tags?.map((id) => ({ id })) || [],
      images: dto.images?.map((img) => ({
        id: img.id,
        src: img.src,
        alt: img.alt || '',
        name: img.name || '',
      })) || [],
    };

    // Add optional fields if provided
    if (dto.slug) wooProductData.slug = dto.slug;
    if (dto.globalUniqueId) wooProductData.global_unique_id = dto.globalUniqueId;
    if (dto.dateOnSaleFrom) wooProductData.date_on_sale_from = dto.dateOnSaleFrom;
    if (dto.dateOnSaleFromGmt) wooProductData.date_on_sale_from_gmt = dto.dateOnSaleFromGmt;
    if (dto.dateOnSaleTo) wooProductData.date_on_sale_to = dto.dateOnSaleTo;
    if (dto.dateOnSaleToGmt) wooProductData.date_on_sale_to_gmt = dto.dateOnSaleToGmt;
    if (dto.virtual !== undefined) wooProductData.virtual = dto.virtual;
    if (dto.downloadable !== undefined) wooProductData.downloadable = dto.downloadable;
    if (dto.downloads?.length) wooProductData.downloads = dto.downloads;
    if (dto.downloadLimit !== undefined) wooProductData.download_limit = dto.downloadLimit;
    if (dto.downloadExpiry !== undefined) wooProductData.download_expiry = dto.downloadExpiry;
    if (dto.externalUrl) wooProductData.external_url = dto.externalUrl;
    if (dto.buttonText) wooProductData.button_text = dto.buttonText;
    if (dto.taxStatus) wooProductData.tax_status = dto.taxStatus;
    if (dto.taxClass) wooProductData.tax_class = dto.taxClass;
    if (dto.backorders) wooProductData.backorders = dto.backorders;
    if (dto.soldIndividually !== undefined) wooProductData.sold_individually = dto.soldIndividually;
    if (dto.dimensions) wooProductData.dimensions = dto.dimensions;
    if (dto.shippingClass) wooProductData.shipping_class = dto.shippingClass;
    if (dto.reviewsAllowed !== undefined) wooProductData.reviews_allowed = dto.reviewsAllowed;
    if (dto.upsellIds?.length) wooProductData.upsell_ids = dto.upsellIds;
    if (dto.crossSellIds?.length) wooProductData.cross_sell_ids = dto.crossSellIds;
    if (dto.parentId) wooProductData.parent_id = dto.parentId;
    if (dto.purchaseNote) wooProductData.purchase_note = dto.purchaseNote;
    if (dto.attributes?.length) wooProductData.attributes = dto.attributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      position: attr.position ?? 0,
      visible: attr.visible ?? true,
      variation: attr.variation ?? false,
      options: attr.options || [],
    }));
    if (dto.defaultAttributes?.length) wooProductData.default_attributes = dto.defaultAttributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      option: attr.option,
    }));
    if (dto.groupedProducts?.length) wooProductData.grouped_products = dto.groupedProducts;
    if (dto.menuOrder !== undefined) wooProductData.menu_order = dto.menuOrder;
    if (dto.metaData?.length) wooProductData.meta_data = dto.metaData;

    let wooProduct: WooProduct | null = null;

    // Push to WooCommerce if requested
    if (pushToWoo) {
      // Fetch store with credentials
      const store = await this.storeModel
        .findById(dto.storeId)
        .select('+credentials');

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      const credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      };

      try {
        wooProduct = await this.wooCommerceService.createProduct(credentials, wooProductData);
      } catch (error) {
        this.logger.error(`Failed to create product in WooCommerce: ${error.message}`, error.stack);
        throw new BadRequestException(`Failed to create product in WooCommerce: ${error.message}`);
      }
    }

    // Create local product - merge WooCommerce response with DTO data
    const productData: any = {
      storeId: new Types.ObjectId(dto.storeId),
      externalId: wooProduct?.id || 0,
      name: wooProduct?.name || dto.name,
      slug: wooProduct?.slug || dto.slug || '',
      permalink: wooProduct?.permalink || '',
      type: wooProduct?.type || dto.type || 'simple',
      status: wooProduct?.status || dto.status || 'draft',
      featured: wooProduct?.featured ?? dto.featured ?? false,
      catalogVisibility: wooProduct?.catalog_visibility || dto.catalogVisibility || 'visible',
      description: wooProduct?.description || dto.description || '',
      shortDescription: wooProduct?.short_description || dto.shortDescription || '',
      sku: wooProduct?.sku || dto.sku || '',
      globalUniqueId: wooProduct?.global_unique_id || dto.globalUniqueId || '',
      price: wooProduct?.price || dto.salePrice || dto.regularPrice || '',
      regularPrice: wooProduct?.regular_price || dto.regularPrice || '',
      salePrice: wooProduct?.sale_price || dto.salePrice || '',
      dateOnSaleFrom: wooProduct?.date_on_sale_from ? new Date(wooProduct.date_on_sale_from) : (dto.dateOnSaleFrom ? new Date(dto.dateOnSaleFrom) : null),
      dateOnSaleFromGmt: wooProduct?.date_on_sale_from_gmt ? new Date(wooProduct.date_on_sale_from_gmt) : (dto.dateOnSaleFromGmt ? new Date(dto.dateOnSaleFromGmt) : null),
      dateOnSaleTo: wooProduct?.date_on_sale_to ? new Date(wooProduct.date_on_sale_to) : (dto.dateOnSaleTo ? new Date(dto.dateOnSaleTo) : null),
      dateOnSaleToGmt: wooProduct?.date_on_sale_to_gmt ? new Date(wooProduct.date_on_sale_to_gmt) : (dto.dateOnSaleToGmt ? new Date(dto.dateOnSaleToGmt) : null),
      priceHtml: wooProduct?.price_html || '',
      onSale: wooProduct?.on_sale ?? !!dto.salePrice,
      purchasable: wooProduct?.purchasable ?? true,
      totalSales: wooProduct?.total_sales || 0,
      virtual: wooProduct?.virtual ?? dto.virtual ?? false,
      downloadable: wooProduct?.downloadable ?? dto.downloadable ?? false,
      downloads: wooProduct?.downloads || dto.downloads || [],
      downloadLimit: wooProduct?.download_limit ?? dto.downloadLimit ?? -1,
      downloadExpiry: wooProduct?.download_expiry ?? dto.downloadExpiry ?? -1,
      externalUrl: wooProduct?.external_url || dto.externalUrl || '',
      buttonText: wooProduct?.button_text || dto.buttonText || '',
      taxStatus: wooProduct?.tax_status || dto.taxStatus || 'taxable',
      taxClass: wooProduct?.tax_class || dto.taxClass || '',
      manageStock: wooProduct?.manage_stock ?? dto.manageStock ?? false,
      stockQuantity: wooProduct?.stock_quantity ?? dto.stockQuantity,
      stockStatus: wooProduct?.stock_status || dto.stockStatus || 'instock',
      backorders: wooProduct?.backorders || dto.backorders || 'no',
      backordersAllowed: wooProduct?.backorders_allowed ?? false,
      backordered: wooProduct?.backordered ?? false,
      soldIndividually: wooProduct?.sold_individually ?? dto.soldIndividually ?? false,
      lowStockAmount: dto.lowStockAmount,
      weight: wooProduct?.weight || dto.weight || '',
      dimensions: wooProduct?.dimensions || dto.dimensions || {},
      shippingRequired: wooProduct?.shipping_required ?? true,
      shippingTaxable: wooProduct?.shipping_taxable ?? true,
      shippingClass: wooProduct?.shipping_class || dto.shippingClass || '',
      shippingClassId: wooProduct?.shipping_class_id || 0,
      reviewsAllowed: wooProduct?.reviews_allowed ?? dto.reviewsAllowed ?? true,
      averageRating: parseFloat(wooProduct?.average_rating || '0'),
      ratingCount: wooProduct?.rating_count || 0,
      relatedIds: wooProduct?.related_ids || [],
      upsellIds: wooProduct?.upsell_ids || dto.upsellIds || [],
      crossSellIds: wooProduct?.cross_sell_ids || dto.crossSellIds || [],
      parentId: wooProduct?.parent_id || dto.parentId || 0,
      purchaseNote: wooProduct?.purchase_note || dto.purchaseNote || '',
      categories: wooProduct?.categories?.map((c: any) => ({ externalId: c.id, name: c.name, slug: c.slug })) || dto.categories?.map((id) => ({ externalId: id })) || [],
      tags: wooProduct?.tags?.map((t: any) => ({ externalId: t.id, name: t.name, slug: t.slug })) || dto.tags?.map((id) => ({ externalId: id })) || [],
      images: wooProduct?.images?.map((img: any, idx: number) => ({
        externalId: img.id,
        src: img.src,
        name: img.name || '',
        alt: img.alt || '',
        position: idx,
      })) || dto.images?.map((img, idx) => ({
        src: img.src,
        alt: img.alt || '',
        name: img.name || '',
        position: img.position ?? idx,
      })) || [],
      attributes: wooProduct?.attributes?.map((a: any) => ({
        externalId: a.id,
        name: a.name,
        position: a.position,
        visible: a.visible,
        variation: a.variation,
        options: a.options || [],
      })) || dto.attributes?.map(a => ({
        name: a.name,
        position: a.position ?? 0,
        visible: a.visible ?? true,
        variation: a.variation ?? false,
        options: a.options || [],
      })) || [],
      defaultAttributes: wooProduct?.default_attributes?.map((a: any) => ({
        externalId: a.id,
        name: a.name,
        option: a.option,
      })) || dto.defaultAttributes || [],
      variationIds: wooProduct?.variations || [],
      variationCount: wooProduct?.variations?.length || 0,
      groupedProducts: wooProduct?.grouped_products || dto.groupedProducts || [],
      menuOrder: wooProduct?.menu_order ?? dto.menuOrder ?? 0,
      metaData: wooProduct?.meta_data?.map((m: any) => ({
        externalId: m.id,
        key: m.key,
        value: m.value,
      })) || dto.metaData || [],
      dateCreatedWoo: wooProduct?.date_created ? new Date(wooProduct.date_created) : null,
      dateCreatedGmtWoo: wooProduct?.date_created_gmt ? new Date(wooProduct.date_created_gmt) : null,
      dateModifiedWoo: wooProduct?.date_modified ? new Date(wooProduct.date_modified) : null,
      dateModifiedGmtWoo: wooProduct?.date_modified_gmt ? new Date(wooProduct.date_modified_gmt) : null,
      pendingSync: !pushToWoo,
      lastSyncedAt: pushToWoo ? new Date() : undefined,
      isDeleted: false,
    };

    const product = await this.productModel.create(productData);

    this.logger.log(`Created product ${product._id} (WooCommerce ID: ${wooProduct?.id || 'not synced'})`);

    return this.toProductInterface(product);
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

    // Update local product - basic fields
    if (dto.name) product.name = dto.name;
    if (dto.slug) product.slug = dto.slug;
    if (dto.type) product.type = dto.type;
    if (dto.status) product.status = dto.status;
    if (dto.featured !== undefined) product.featured = dto.featured;
    if (dto.catalogVisibility) product.catalogVisibility = dto.catalogVisibility;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.shortDescription !== undefined) product.shortDescription = dto.shortDescription;
    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.globalUniqueId !== undefined) product.globalUniqueId = dto.globalUniqueId;

    // Pricing fields
    if (dto.regularPrice !== undefined) product.regularPrice = dto.regularPrice;
    if (dto.salePrice !== undefined) product.salePrice = dto.salePrice;
    if (dto.dateOnSaleFrom !== undefined) product.dateOnSaleFrom = dto.dateOnSaleFrom ? new Date(dto.dateOnSaleFrom) : null;
    if (dto.dateOnSaleFromGmt !== undefined) product.dateOnSaleFromGmt = dto.dateOnSaleFromGmt ? new Date(dto.dateOnSaleFromGmt) : null;
    if (dto.dateOnSaleTo !== undefined) product.dateOnSaleTo = dto.dateOnSaleTo ? new Date(dto.dateOnSaleTo) : null;
    if (dto.dateOnSaleToGmt !== undefined) product.dateOnSaleToGmt = dto.dateOnSaleToGmt ? new Date(dto.dateOnSaleToGmt) : null;

    // Product type fields
    if (dto.virtual !== undefined) product.virtual = dto.virtual;
    if (dto.downloadable !== undefined) product.downloadable = dto.downloadable;
    if (dto.downloads) product.downloads = dto.downloads;
    if (dto.downloadLimit !== undefined) product.downloadLimit = dto.downloadLimit;
    if (dto.downloadExpiry !== undefined) product.downloadExpiry = dto.downloadExpiry;
    if (dto.externalUrl !== undefined) product.externalUrl = dto.externalUrl;
    if (dto.buttonText !== undefined) product.buttonText = dto.buttonText;

    // Tax fields
    if (dto.taxStatus) product.taxStatus = dto.taxStatus;
    if (dto.taxClass !== undefined) product.taxClass = dto.taxClass;

    // Stock fields
    if (dto.manageStock !== undefined) product.manageStock = dto.manageStock;
    if (dto.stockQuantity !== undefined) product.stockQuantity = dto.stockQuantity;
    if (dto.stockStatus) product.stockStatus = dto.stockStatus;
    if (dto.backorders) product.backorders = dto.backorders;
    if (dto.lowStockAmount !== undefined) product.lowStockAmount = dto.lowStockAmount;
    if (dto.soldIndividually !== undefined) product.soldIndividually = dto.soldIndividually;

    // Shipping fields
    if (dto.weight !== undefined) product.weight = dto.weight;
    if (dto.dimensions) product.dimensions = dto.dimensions;
    if (dto.shippingClass !== undefined) product.shippingClass = dto.shippingClass;

    // Related products
    if (dto.reviewsAllowed !== undefined) product.reviewsAllowed = dto.reviewsAllowed;
    if (dto.upsellIds) product.upsellIds = dto.upsellIds;
    if (dto.crossSellIds) product.crossSellIds = dto.crossSellIds;
    if (dto.parentId !== undefined) product.parentId = dto.parentId;
    if (dto.purchaseNote !== undefined) product.purchaseNote = dto.purchaseNote;

    // Categories, tags, images - look up actual names and slugs from database
    if (dto.categories) {
      const categoryDocs = await this.categoryModel.find({
        storeId: product.storeId,
        externalId: { $in: dto.categories },
        isDeleted: false,
      }).select('externalId name slug');
      const categoryMap = new Map(categoryDocs.map(c => [c.externalId, { name: c.name, slug: c.slug }]));
      product.categories = dto.categories.map(id => ({
        externalId: id,
        name: categoryMap.get(id)?.name || '',
        slug: categoryMap.get(id)?.slug || '',
      }));
    }
    if (dto.tags) {
      const tagDocs = await this.tagModel.find({
        storeId: product.storeId,
        externalId: { $in: dto.tags },
        isDeleted: false,
      }).select('externalId name slug');
      const tagMap = new Map(tagDocs.map(t => [t.externalId, { name: t.name, slug: t.slug }]));
      product.tags = dto.tags.map(id => ({
        externalId: id,
        name: tagMap.get(id)?.name || '',
        slug: tagMap.get(id)?.slug || '',
      }));
    }
    if (dto.images) {
      product.images = dto.images.map((img, idx) => ({
        externalId: img.id,
        src: img.src || '',
        name: img.name || '',
        alt: img.alt || '',
        position: img.position ?? idx,
      }));
    }

    // Attributes
    if (dto.attributes) {
      product.attributes = dto.attributes.map(attr => ({
        externalId: attr.id,
        name: attr.name,
        position: attr.position ?? 0,
        visible: attr.visible ?? true,
        variation: attr.variation ?? false,
        options: attr.options || [],
      }));
    }
    if (dto.defaultAttributes) {
      product.defaultAttributes = dto.defaultAttributes.map(attr => ({
        externalId: attr.id,
        name: attr.name,
        option: attr.option,
      }));
    }

    // Other fields
    if (dto.groupedProducts) product.groupedProducts = dto.groupedProducts;
    if (dto.menuOrder !== undefined) product.menuOrder = dto.menuOrder;
    if (dto.metaData) {
      product.metaData = dto.metaData.map(m => ({
        externalId: m.id,
        key: m.key,
        value: m.value,
      }));
    }

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
   * Update a single variant locally and optionally push to WooCommerce
   */
  async updateVariant(
    variantId: string,
    userId: string,
    dto: UpdateVariantDto,
    pushToWoo: boolean = true,
  ): Promise<IProductVariant> {
    const variant = await this.variantModel.findOne({
      _id: new Types.ObjectId(variantId),
      isDeleted: false,
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    await this.verifyStoreAccess(variant.storeId.toString(), userId);

    // Update variant fields
    if (dto.regularPrice !== undefined) {
      variant.regularPrice = dto.regularPrice;
      variant.price = dto.salePrice || dto.regularPrice;
    }
    if (dto.salePrice !== undefined) {
      variant.salePrice = dto.salePrice;
      if (dto.salePrice) {
        variant.price = dto.salePrice;
        variant.onSale = true;
      } else {
        variant.onSale = false;
        if (variant.regularPrice) {
          variant.price = variant.regularPrice;
        }
      }
    }
    if (dto.sku !== undefined) {
      variant.sku = dto.sku;
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
    if (dto.status !== undefined) {
      variant.status = dto.status;
    }
    if (dto.weight !== undefined) {
      variant.weight = dto.weight;
    }
    if (dto.description !== undefined) {
      variant.description = dto.description;
    }

    variant.pendingSync = !pushToWoo;
    await variant.save();

    // Push to WooCommerce
    if (pushToWoo && variant.externalId) {
      await this.syncVariantToWoo(variant);
    }

    return this.toVariantInterface(variant);
  }

  /**
   * Get variant by ID
   */
  async findVariantById(variantId: string, userId: string): Promise<IProductVariant> {
    const variant = await this.variantModel.findOne({
      _id: new Types.ObjectId(variantId),
      isDeleted: false,
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    await this.verifyStoreAccess(variant.storeId.toString(), userId);

    return this.toVariantInterface(variant);
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

    try {
      const wooUpdateData: any = {
        name: product.name,
        slug: product.slug,
        type: product.type,
        status: product.status,
        featured: product.featured,
        catalog_visibility: product.catalogVisibility,
        description: product.description,
        short_description: product.shortDescription,
        sku: product.sku,
        regular_price: product.regularPrice,
        sale_price: product.salePrice || '',
        manage_stock: product.manageStock,
        stock_quantity: product.stockQuantity,
        stock_status: product.stockStatus,
      };

      // Add optional fields if they have values
      if (product.globalUniqueId) wooUpdateData.global_unique_id = product.globalUniqueId;
      if (product.dateOnSaleFrom) wooUpdateData.date_on_sale_from = product.dateOnSaleFrom.toISOString();
      if (product.dateOnSaleFromGmt) wooUpdateData.date_on_sale_from_gmt = product.dateOnSaleFromGmt.toISOString();
      if (product.dateOnSaleTo) wooUpdateData.date_on_sale_to = product.dateOnSaleTo.toISOString();
      if (product.dateOnSaleToGmt) wooUpdateData.date_on_sale_to_gmt = product.dateOnSaleToGmt.toISOString();
      if (product.virtual !== undefined) wooUpdateData.virtual = product.virtual;
      if (product.downloadable !== undefined) wooUpdateData.downloadable = product.downloadable;
      if (product.downloads?.length) wooUpdateData.downloads = product.downloads;
      if (product.downloadLimit !== undefined) wooUpdateData.download_limit = product.downloadLimit;
      if (product.downloadExpiry !== undefined) wooUpdateData.download_expiry = product.downloadExpiry;
      if (product.externalUrl) wooUpdateData.external_url = product.externalUrl;
      if (product.buttonText) wooUpdateData.button_text = product.buttonText;
      if (product.taxStatus) wooUpdateData.tax_status = product.taxStatus;
      if (product.taxClass !== undefined) wooUpdateData.tax_class = product.taxClass;
      if (product.backorders) wooUpdateData.backorders = product.backorders;
      if (product.soldIndividually !== undefined) wooUpdateData.sold_individually = product.soldIndividually;
      if (product.weight) wooUpdateData.weight = product.weight;
      if (product.dimensions) wooUpdateData.dimensions = product.dimensions;
      if (product.shippingClass) wooUpdateData.shipping_class = product.shippingClass;
      if (product.reviewsAllowed !== undefined) wooUpdateData.reviews_allowed = product.reviewsAllowed;
      if (product.upsellIds?.length) wooUpdateData.upsell_ids = product.upsellIds;
      if (product.crossSellIds?.length) wooUpdateData.cross_sell_ids = product.crossSellIds;
      if (product.parentId) wooUpdateData.parent_id = product.parentId;
      if (product.purchaseNote) wooUpdateData.purchase_note = product.purchaseNote;
      if (product.categories?.length) {
        wooUpdateData.categories = product.categories.map(c => ({ id: c.externalId }));
      }
      if (product.tags?.length) {
        wooUpdateData.tags = product.tags.map(t => ({ id: t.externalId }));
      }
      if (product.images?.length) {
        wooUpdateData.images = product.images.map(img => ({
          id: img.externalId,
          src: img.src,
          name: img.name,
          alt: img.alt,
        }));
      }
      if (product.attributes?.length) {
        wooUpdateData.attributes = product.attributes.map(a => ({
          id: a.externalId,
          name: a.name,
          position: a.position,
          visible: a.visible,
          variation: a.variation,
          options: a.options,
        }));
      }
      if (product.defaultAttributes?.length) {
        wooUpdateData.default_attributes = product.defaultAttributes.map(a => ({
          id: a.externalId,
          name: a.name,
          option: a.option,
        }));
      }
      if (product.groupedProducts?.length) wooUpdateData.grouped_products = product.groupedProducts;
      if (product.menuOrder !== undefined) wooUpdateData.menu_order = product.menuOrder;
      if (product.metaData?.length) {
        wooUpdateData.meta_data = product.metaData.map(m => ({
          id: m.externalId,
          key: m.key,
          value: m.value,
        }));
      }

      await this.wooCommerceService.updateProduct(credentials, product.externalId, wooUpdateData);

      product.pendingSync = false;
      product.lastSyncedAt = new Date();
      await product.save();
    } catch (error) {
      this.logger.error(`Failed to sync product to WooCommerce: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to sync product to WooCommerce: ${error.message}`);
    }
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

    const productData: any = {
      storeId: new Types.ObjectId(storeId),
      externalId: wooProduct.id,
      sku: wooProduct.sku || '',
      name: wooProduct.name,
      slug: wooProduct.slug,
      permalink: wooProduct.permalink,
      type: wooProduct.type,
      status: wooProduct.status,
      featured: wooProduct.featured,
      catalogVisibility: wooProduct.catalog_visibility,
      description: wooProduct.description,
      shortDescription: wooProduct.short_description,
      globalUniqueId: (wooProduct as any).global_unique_id || '',
      price: wooProduct.price,
      regularPrice: wooProduct.regular_price,
      salePrice: wooProduct.sale_price,
      dateOnSaleFrom: wooProduct.date_on_sale_from ? new Date(wooProduct.date_on_sale_from) : null,
      dateOnSaleFromGmt: wooProduct.date_on_sale_from_gmt ? new Date(wooProduct.date_on_sale_from_gmt) : null,
      dateOnSaleTo: wooProduct.date_on_sale_to ? new Date(wooProduct.date_on_sale_to) : null,
      dateOnSaleToGmt: wooProduct.date_on_sale_to_gmt ? new Date(wooProduct.date_on_sale_to_gmt) : null,
      priceHtml: wooProduct.price_html || '',
      onSale: wooProduct.on_sale,
      purchasable: wooProduct.purchasable,
      totalSales: wooProduct.total_sales,
      virtual: wooProduct.virtual,
      downloadable: wooProduct.downloadable,
      downloads: wooProduct.downloads || [],
      downloadLimit: wooProduct.download_limit ?? -1,
      downloadExpiry: wooProduct.download_expiry ?? -1,
      externalUrl: wooProduct.external_url || '',
      buttonText: wooProduct.button_text || '',
      taxStatus: wooProduct.tax_status || 'taxable',
      taxClass: wooProduct.tax_class || '',
      manageStock: wooProduct.manage_stock,
      stockQuantity: wooProduct.stock_quantity,
      stockStatus: wooProduct.stock_status,
      backorders: wooProduct.backorders || 'no',
      backordersAllowed: wooProduct.backorders_allowed ?? false,
      backordered: wooProduct.backordered ?? false,
      soldIndividually: wooProduct.sold_individually ?? false,
      lowStockAmount: wooProduct.low_stock_amount,
      weight: wooProduct.weight,
      dimensions: wooProduct.dimensions,
      shippingRequired: wooProduct.shipping_required ?? true,
      shippingTaxable: wooProduct.shipping_taxable ?? true,
      shippingClass: wooProduct.shipping_class || '',
      shippingClassId: wooProduct.shipping_class_id || 0,
      reviewsAllowed: wooProduct.reviews_allowed ?? true,
      averageRating: parseFloat(wooProduct.average_rating || '0'),
      ratingCount: wooProduct.rating_count || 0,
      relatedIds: wooProduct.related_ids || [],
      upsellIds: wooProduct.upsell_ids || [],
      crossSellIds: wooProduct.cross_sell_ids || [],
      categories: wooProduct.categories?.map((c: any) => ({
        externalId: c.id,
        name: c.name,
        slug: c.slug,
      })) || [],
      tags: wooProduct.tags?.map((t: any) => ({
        externalId: t.id,
        name: t.name,
        slug: t.slug,
      })) || [],
      images: wooProduct.images?.map((img: any, idx: number) => ({
        externalId: img.id,
        src: img.src,
        name: img.name || '',
        alt: img.alt || '',
        position: idx,
      })) || [],
      attributes: wooProduct.attributes?.map((a: any) => ({
        externalId: a.id,
        name: a.name,
        position: a.position,
        visible: a.visible,
        variation: a.variation,
        options: a.options || [],
      })) || [],
      defaultAttributes: wooProduct.default_attributes?.map((a: any) => ({
        externalId: a.id,
        name: a.name,
        option: a.option,
      })) || [],
      variationIds: wooProduct.variations || [],
      variationCount: wooProduct.variations?.length || 0,
      groupedProducts: wooProduct.grouped_products || [],
      menuOrder: wooProduct.menu_order || 0,
      purchaseNote: wooProduct.purchase_note || '',
      metaData: wooProduct.meta_data?.map((m: any) => ({
        externalId: m.id,
        key: m.key,
        value: m.value,
      })) || [],
      parentId: wooProduct.parent_id,
      dateCreatedWoo: wooProduct.date_created ? new Date(wooProduct.date_created) : null,
      dateCreatedGmtWoo: wooProduct.date_created_gmt ? new Date(wooProduct.date_created_gmt) : null,
      dateModifiedWoo: wooProduct.date_modified ? new Date(wooProduct.date_modified) : null,
      dateModifiedGmtWoo: wooProduct.date_modified_gmt ? new Date(wooProduct.date_modified_gmt) : null,
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
    images: { src: string; alt?: string; name?: string; position?: number; externalId?: number }[],
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

    // Track existing images for deletion detection
    const existingImages = [...product.images];
    const newImageSrcs = new Set(images.map((img) => img.src));

    // Find images that were removed (exist in old but not in new)
    const removedImages = existingImages.filter((img) => !newImageSrcs.has(img.src));

    // Create a map of existing images by src URL to preserve externalId
    const existingImagesMap = new Map<string, number>();
    product.images.forEach((img) => {
      if (img.externalId && img.src) {
        existingImagesMap.set(img.src, img.externalId);
      }
    });

    // Update images - use externalId from request, or fall back to existing map
    product.images = images.map((img, index) => ({
      src: img.src,
      alt: img.alt || '',
      name: img.name || '',
      position: img.position !== undefined ? img.position : index,
      // Use externalId from request if provided, otherwise try to preserve from existing
      externalId: img.externalId || existingImagesMap.get(img.src),
    }));

    product.pendingSync = !pushToWoo;
    await product.save();

    if (pushToWoo) {
      await this.syncImagesToWoo(product);
    }

    // Delete removed images from WordPress and S3 (in background, don't block response)
    if (removedImages.length > 0) {
      this.deleteRemovedImages(product.storeId.toString(), removedImages).catch((error) => {
        this.logger.warn(`Failed to delete some removed images: ${error.message}`);
      });
    }

    return this.toProductInterface(product);
  }

  /**
   * Delete images from WordPress Media Library and/or S3
   */
  private async deleteRemovedImages(
    storeId: string,
    images: { src: string; externalId?: number }[],
  ): Promise<void> {
    // Get store credentials for WordPress media deletion
    const store = await this.storeModel
      .findById(storeId)
      .select('+credentials');

    let credentials = null;
    if (store) {
      credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
        // Include WordPress credentials if available
        wpUsername: store.credentials.wpUsername,
        wpAppPassword: store.credentials.wpAppPassword,
      };
    }

    for (const img of images) {
      // Delete from WordPress Media Library if has externalId
      if (img.externalId && credentials) {
        try {
          this.logger.log(`Deleting WordPress media ID: ${img.externalId}`);
          await this.wooCommerceService.deleteMedia(credentials, img.externalId);
        } catch (error) {
          this.logger.warn(`Failed to delete WordPress media ID ${img.externalId}: ${error.message}`);
        }
      }

      // Delete from S3 if it's an S3 URL
      if (img.src && this.isS3Url(img.src)) {
        try {
          this.logger.log(`Deleting S3 image: ${img.src}`);
          await this.s3UploadService.deleteFile(img.src);
        } catch (error) {
          this.logger.warn(`Failed to delete S3 image ${img.src}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Check if a URL is an S3 URL
   */
  private isS3Url(url: string): boolean {
    return url.includes('.s3.') && url.includes('.amazonaws.com');
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

    // Get the image to be deleted before removing it
    const deletedImage = { ...product.images[imageIndex] };

    product.images.splice(imageIndex, 1);
    product.images.forEach((img, idx) => {
      img.position = idx;
    });

    product.pendingSync = !pushToWoo;
    await product.save();

    if (pushToWoo) {
      await this.syncImagesToWoo(product);
    }

    // Delete the removed image from WordPress and S3 (in background)
    this.deleteRemovedImages(product.storeId.toString(), [deletedImage]).catch((error) => {
      this.logger.warn(`Failed to delete image: ${error.message}`);
    });

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

    // Fetch current product from WooCommerce to get existing image IDs
    // This ensures we don't re-upload images that already exist in WordPress
    let wooImageMap = new Map<string, number>();
    try {
      const currentWooProduct = await this.wooCommerceService.getProduct(credentials, product.externalId);
      if (currentWooProduct?.images) {
        currentWooProduct.images.forEach((img: any) => {
          if (img.id && img.src) {
            wooImageMap.set(img.src, img.id);
          }
        });
      }
    } catch (error) {
      // If we can't fetch the product, continue without the map
      console.warn('Could not fetch current WooCommerce product for image ID mapping:', error.message);
    }

    const updatedProduct = await this.wooCommerceService.updateProduct(credentials, product.externalId, {
      images: product.images.map((img) => {
        // First check if we have externalId stored locally
        if (img.externalId) {
          return {
            id: img.externalId,
            alt: img.alt,
            position: img.position,
          };
        }
        // Then check if the image exists in WooCommerce (matched by src URL)
        const wooImageId = wooImageMap.get(img.src);
        if (wooImageId) {
          return {
            id: wooImageId,
            alt: img.alt,
            position: img.position,
          };
        }
        // For truly new images, send src so WooCommerce uploads them
        return {
          src: img.src,
          alt: img.alt,
          position: img.position,
        };
      }),
    });

    // Update local images with the returned WooCommerce image IDs
    // This ensures newly uploaded images get their externalId stored
    // IMPORTANT: Keep the original local src (especially for S3 URLs) so URL matching
    // continues to work when reordering images
    if (updatedProduct?.images && Array.isArray(updatedProduct.images)) {
      product.images = product.images.map((localImg, index) => {
        const wooImg = updatedProduct.images[index];
        if (wooImg && wooImg.id) {
          return {
            // Keep original local src to preserve S3 URLs for matching
            src: localImg.src,
            alt: localImg.alt || '',
            name: localImg.name || '',
            position: localImg.position,
            externalId: wooImg.id,
          };
        }
        return {
          src: localImg.src,
          alt: localImg.alt || '',
          name: localImg.name || '',
          position: localImg.position,
          externalId: localImg.externalId,
        };
      });
    }

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
