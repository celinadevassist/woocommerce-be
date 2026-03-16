import { Injectable, Logger } from '@nestjs/common';
import {
  ResourceNotFoundException,
  AccessDeniedException,
  ValidationException,
  InvalidInputException,
} from '../shared/exceptions';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schema';
import { ProductVariant, ProductVariantDocument } from './variant.schema';
import {
  UpdateProductDto,
  UpdateStockDto,
  BulkUpdateProductDto,
  BulkUpdateVariantDto,
  CreateProductDto,
  UpdateVariantDto,
} from './dto.update';
import { QueryProductDto } from './dto.query';
import {
  IProduct,
  IProductVariant,
  IProductWithVariants,
  IProductResponse,
} from './interface';
import { StockStatus } from './enum';
import { Store, StoreDocument } from '../store/schema';
import { Category, CategoryDocument } from '../category/schema';
import { Tag, TagDocument } from '../tag/schema';
import { Attribute, AttributeDocument } from '../attribute/schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import {
  WooProduct,
  WooProductVariation,
} from '../integrations/woocommerce/woocommerce.types';
import { S3UploadService } from '../modules/s3-upload/s3-upload.service';
import { SearchAnalyticsService } from '../modules/search-analytics/search-analytics.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name)
    private variantModel: Model<ProductVariantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Tag.name) private tagModel: Model<TagDocument>,
    @InjectModel(Attribute.name)
    private attributeModel: Model<AttributeDocument>,
    private readonly wooCommerceService: WooCommerceService,
    private readonly s3UploadService: S3UploadService,
    private readonly searchAnalyticsService: SearchAnalyticsService,
  ) {}

  /**
   * Get stores user has access to
   */
  private async getUserStoreIds(userId: string): Promise<Types.ObjectId[]> {
    const stores = await this.storeModel
      .find({
        isDeleted: false,
        $or: [
          { ownerId: new Types.ObjectId(userId) },
          { 'members.userId': new Types.ObjectId(userId) },
        ],
      })
      .select('_id');

    return stores.map((store) => store._id);
  }

  /**
   * Verify user has access to store
   */
  private async verifyStoreAccess(
    storeId: string,
    userId: string,
  ): Promise<StoreDocument> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new ResourceNotFoundException('Store', storeId);
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new AccessDeniedException('store', 'user is not owner or member');
    }

    return store;
  }

  /**
   * Validate that sale price is not greater than regular price
   */
  private validatePrices(regularPrice?: string, salePrice?: string): void {
    if (regularPrice && salePrice) {
      const regular = parseFloat(regularPrice);
      const sale = parseFloat(salePrice);
      if (!isNaN(regular) && !isNaN(sale) && sale > regular) {
        throw new ValidationException(
          'salePrice',
          'cannot be greater than regular price',
          { regularPrice, salePrice },
        );
      }
    }
  }

  /**
   * Get products with filtering and pagination
   */
  async findAll(
    userId: string,
    query: QueryProductDto,
    ip?: string,
  ): Promise<IProductResponse> {
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

    // Track search analytics if keyword is provided
    if (query.keyword) {
      await this.searchAnalyticsService.saveSearchQuery(
        query.keyword,
        'products',
        total,
        ip,
        userId,
      );
    }

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
      throw new ResourceNotFoundException('Product', id);
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
    pushToWoo = true,
  ): Promise<IProduct> {
    // Verify user has access to store
    await this.verifyStoreAccess(dto.storeId, userId);

    // Validate prices
    this.validatePrices(dto.regularPrice, dto.salePrice);

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
      stock_status:
        dto.type === 'variable' ? 'instock' : dto.stockStatus || 'instock',
      weight: dto.weight || '',
      categories: dto.categories?.map((id) => ({ id })) || [],
      tags: dto.tags?.map((id) => ({ id })) || [],
      images:
        dto.images?.map((img) => ({
          id: img.id,
          src: img.src,
          alt: img.alt || '',
          name: img.name || '',
        })) || [],
    };

    // Add optional fields if provided
    if (dto.slug) wooProductData.slug = dto.slug;
    if (dto.globalUniqueId)
      wooProductData.global_unique_id = dto.globalUniqueId;
    if (dto.dateOnSaleFrom)
      wooProductData.date_on_sale_from = dto.dateOnSaleFrom;
    if (dto.dateOnSaleFromGmt)
      wooProductData.date_on_sale_from_gmt = dto.dateOnSaleFromGmt;
    if (dto.dateOnSaleTo) wooProductData.date_on_sale_to = dto.dateOnSaleTo;
    if (dto.dateOnSaleToGmt)
      wooProductData.date_on_sale_to_gmt = dto.dateOnSaleToGmt;
    if (dto.virtual !== undefined) wooProductData.virtual = dto.virtual;
    if (dto.downloadable !== undefined)
      wooProductData.downloadable = dto.downloadable;
    if (dto.downloads?.length) wooProductData.downloads = dto.downloads;
    if (dto.downloadLimit !== undefined)
      wooProductData.download_limit = dto.downloadLimit;
    if (dto.downloadExpiry !== undefined)
      wooProductData.download_expiry = dto.downloadExpiry;
    if (dto.externalUrl) wooProductData.external_url = dto.externalUrl;
    if (dto.buttonText) wooProductData.button_text = dto.buttonText;
    if (dto.taxStatus) wooProductData.tax_status = dto.taxStatus;
    if (dto.taxClass) wooProductData.tax_class = dto.taxClass;
    if (dto.backorders) wooProductData.backorders = dto.backorders;
    if (dto.soldIndividually !== undefined)
      wooProductData.sold_individually = dto.soldIndividually;
    if (dto.dimensions) wooProductData.dimensions = dto.dimensions;
    if (dto.shippingClass) wooProductData.shipping_class = dto.shippingClass;
    if (dto.reviewsAllowed !== undefined)
      wooProductData.reviews_allowed = dto.reviewsAllowed;
    if (dto.upsellIds?.length) wooProductData.upsell_ids = dto.upsellIds;
    if (dto.crossSellIds?.length)
      wooProductData.cross_sell_ids = dto.crossSellIds;
    if (dto.parentId) wooProductData.parent_id = dto.parentId;
    if (dto.purchaseNote) wooProductData.purchase_note = dto.purchaseNote;
    if (dto.attributes?.length)
      wooProductData.attributes = dto.attributes.map((attr) => ({
        id: attr.id,
        name: attr.name,
        position: attr.position ?? 0,
        visible: attr.visible ?? true,
        variation: attr.variation ?? false,
        options: attr.options || [],
      }));
    if (dto.defaultAttributes?.length)
      wooProductData.default_attributes = dto.defaultAttributes.map((attr) => ({
        id: attr.id,
        name: attr.name,
        option: attr.option,
      }));
    if (dto.groupedProducts?.length)
      wooProductData.grouped_products = dto.groupedProducts;
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
        throw new ResourceNotFoundException('Store', dto.storeId);
      }

      const credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      };

      try {
        wooProduct = await this.wooCommerceService.createProduct(
          credentials,
          wooProductData,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create product in WooCommerce: ${error.message}`,
          error.stack,
        );
        throw new InvalidInputException(
          'WooCommerce product data',
          `Failed to create in WooCommerce: ${error.message}`,
          'Valid product data compatible with WooCommerce API',
        );
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
      catalogVisibility:
        wooProduct?.catalog_visibility || dto.catalogVisibility || 'visible',
      description: wooProduct?.description || dto.description || '',
      shortDescription:
        wooProduct?.short_description || dto.shortDescription || '',
      sku: wooProduct?.sku || dto.sku || '',
      globalUniqueId: wooProduct?.global_unique_id || dto.globalUniqueId || '',
      price: wooProduct?.price || dto.salePrice || dto.regularPrice || '',
      regularPrice: wooProduct?.regular_price || dto.regularPrice || '',
      salePrice: wooProduct?.sale_price || dto.salePrice || '',
      dateOnSaleFrom: wooProduct?.date_on_sale_from
        ? new Date(wooProduct.date_on_sale_from)
        : dto.dateOnSaleFrom
        ? new Date(dto.dateOnSaleFrom)
        : null,
      dateOnSaleFromGmt: wooProduct?.date_on_sale_from_gmt
        ? new Date(wooProduct.date_on_sale_from_gmt)
        : dto.dateOnSaleFromGmt
        ? new Date(dto.dateOnSaleFromGmt)
        : null,
      dateOnSaleTo: wooProduct?.date_on_sale_to
        ? new Date(wooProduct.date_on_sale_to)
        : dto.dateOnSaleTo
        ? new Date(dto.dateOnSaleTo)
        : null,
      dateOnSaleToGmt: wooProduct?.date_on_sale_to_gmt
        ? new Date(wooProduct.date_on_sale_to_gmt)
        : dto.dateOnSaleToGmt
        ? new Date(dto.dateOnSaleToGmt)
        : null,
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
      soldIndividually:
        wooProduct?.sold_individually ?? dto.soldIndividually ?? false,
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
      categories:
        wooProduct?.categories?.map((c: any) => ({
          externalId: c.id,
          name: c.name,
          slug: c.slug,
        })) ||
        dto.categories?.map((id) => ({ externalId: id })) ||
        [],
      tags:
        wooProduct?.tags?.map((t: any) => ({
          externalId: t.id,
          name: t.name,
          slug: t.slug,
        })) ||
        dto.tags?.map((id) => ({ externalId: id })) ||
        [],
      images:
        wooProduct?.images?.map((img: any, idx: number) => ({
          externalId: img.id,
          src: img.src,
          name: img.name || '',
          alt: img.alt || '',
          position: idx,
        })) ||
        dto.images?.map((img, idx) => ({
          src: img.src,
          alt: img.alt || '',
          name: img.name || '',
          position: img.position ?? idx,
        })) ||
        [],
      attributes:
        wooProduct?.attributes?.map((a: any) => ({
          externalId: a.id,
          name: a.name,
          position: a.position,
          visible: a.visible,
          variation: a.variation,
          options: a.options || [],
        })) ||
        dto.attributes?.map((a) => ({
          name: a.name,
          position: a.position ?? 0,
          visible: a.visible ?? true,
          variation: a.variation ?? false,
          options: a.options || [],
        })) ||
        [],
      defaultAttributes:
        wooProduct?.default_attributes?.map((a: any) => ({
          externalId: a.id,
          name: a.name,
          option: a.option,
        })) ||
        dto.defaultAttributes ||
        [],
      variationIds: wooProduct?.variations || [],
      variationCount: wooProduct?.variations?.length || 0,
      groupedProducts:
        wooProduct?.grouped_products || dto.groupedProducts || [],
      menuOrder: wooProduct?.menu_order ?? dto.menuOrder ?? 0,
      metaData:
        wooProduct?.meta_data?.map((m: any) => ({
          externalId: m.id,
          key: m.key,
          value: m.value,
        })) ||
        dto.metaData ||
        [],
      dateCreatedWoo: wooProduct?.date_created
        ? new Date(wooProduct.date_created)
        : null,
      dateCreatedGmtWoo: wooProduct?.date_created_gmt
        ? new Date(wooProduct.date_created_gmt)
        : null,
      dateModifiedWoo: wooProduct?.date_modified
        ? new Date(wooProduct.date_modified)
        : null,
      dateModifiedGmtWoo: wooProduct?.date_modified_gmt
        ? new Date(wooProduct.date_modified_gmt)
        : null,
      pendingSync: !pushToWoo,
      lastSyncedAt: pushToWoo ? new Date() : undefined,
      isDeleted: false,
    };

    const product = await this.productModel.create(productData);

    this.logger.log(
      `Created product ${product._id} (WooCommerce ID: ${
        wooProduct?.id || 'not synced'
      })`,
    );

    return this.toProductInterface(product);
  }

  /**
   * Update product locally and optionally push to WooCommerce
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateProductDto,
    pushToWoo = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new ResourceNotFoundException('Product', id);
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Validate prices - use provided values or fall back to existing
    const regularPrice = dto.regularPrice ?? product.regularPrice;
    const salePrice = dto.salePrice ?? product.salePrice;
    this.validatePrices(regularPrice, salePrice);

    // Update local product - basic fields
    if (dto.name) product.name = dto.name;
    if (dto.slug) product.slug = dto.slug;
    if (dto.type) product.type = dto.type;
    if (dto.status) product.status = dto.status;
    if (dto.featured !== undefined) product.featured = dto.featured;
    if (dto.catalogVisibility)
      product.catalogVisibility = dto.catalogVisibility;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.shortDescription !== undefined)
      product.shortDescription = dto.shortDescription;
    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.globalUniqueId !== undefined)
      product.globalUniqueId = dto.globalUniqueId;

    // Pricing fields
    if (dto.regularPrice !== undefined) product.regularPrice = dto.regularPrice;
    if (dto.salePrice !== undefined) product.salePrice = dto.salePrice;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.onSale !== undefined) product.onSale = dto.onSale;
    if (dto.dateOnSaleFrom !== undefined)
      product.dateOnSaleFrom = dto.dateOnSaleFrom
        ? new Date(dto.dateOnSaleFrom)
        : null;
    if (dto.dateOnSaleFromGmt !== undefined)
      product.dateOnSaleFromGmt = dto.dateOnSaleFromGmt
        ? new Date(dto.dateOnSaleFromGmt)
        : null;
    if (dto.dateOnSaleTo !== undefined)
      product.dateOnSaleTo = dto.dateOnSaleTo
        ? new Date(dto.dateOnSaleTo)
        : null;
    if (dto.dateOnSaleToGmt !== undefined)
      product.dateOnSaleToGmt = dto.dateOnSaleToGmt
        ? new Date(dto.dateOnSaleToGmt)
        : null;

    // Product type fields
    if (dto.virtual !== undefined) product.virtual = dto.virtual;
    if (dto.downloadable !== undefined) product.downloadable = dto.downloadable;
    if (dto.downloads) product.downloads = dto.downloads;
    if (dto.downloadLimit !== undefined)
      product.downloadLimit = dto.downloadLimit;
    if (dto.downloadExpiry !== undefined)
      product.downloadExpiry = dto.downloadExpiry;
    if (dto.externalUrl !== undefined) product.externalUrl = dto.externalUrl;
    if (dto.buttonText !== undefined) product.buttonText = dto.buttonText;

    // Tax fields
    if (dto.taxStatus) product.taxStatus = dto.taxStatus;
    if (dto.taxClass !== undefined) product.taxClass = dto.taxClass;

    // Stock fields
    if (dto.manageStock !== undefined) product.manageStock = dto.manageStock;
    if (dto.stockQuantity !== undefined)
      product.stockQuantity = dto.stockQuantity;
    if (dto.stockStatus) product.stockStatus = dto.stockStatus;
    if (dto.backorders) product.backorders = dto.backorders;
    if (dto.lowStockAmount !== undefined)
      product.lowStockAmount = dto.lowStockAmount;
    if (dto.soldIndividually !== undefined)
      product.soldIndividually = dto.soldIndividually;

    // Shipping fields
    if (dto.weight !== undefined) product.weight = dto.weight;
    if (dto.dimensions) product.dimensions = dto.dimensions;
    if (dto.shippingClass !== undefined)
      product.shippingClass = dto.shippingClass;

    // Related products
    if (dto.reviewsAllowed !== undefined)
      product.reviewsAllowed = dto.reviewsAllowed;
    if (dto.upsellIds) product.upsellIds = dto.upsellIds;
    if (dto.crossSellIds) product.crossSellIds = dto.crossSellIds;
    if (dto.parentId !== undefined) product.parentId = dto.parentId;
    if (dto.purchaseNote !== undefined) product.purchaseNote = dto.purchaseNote;

    // Categories, tags, images - look up actual names and slugs from database
    if (dto.categories) {
      const categoryDocs = await this.categoryModel
        .find({
          storeId: product.storeId,
          externalId: { $in: dto.categories },
          isDeleted: false,
        })
        .select('externalId name slug');
      const categoryMap = new Map(
        categoryDocs.map((c) => [c.externalId, { name: c.name, slug: c.slug }]),
      );
      product.categories = dto.categories.map((id) => ({
        externalId: id,
        name: categoryMap.get(id)?.name || '',
        slug: categoryMap.get(id)?.slug || '',
      }));
    }
    if (dto.tags) {
      const tagDocs = await this.tagModel
        .find({
          storeId: product.storeId,
          externalId: { $in: dto.tags },
          isDeleted: false,
        })
        .select('externalId name slug');
      const tagMap = new Map(
        tagDocs.map((t) => [t.externalId, { name: t.name, slug: t.slug }]),
      );
      product.tags = dto.tags.map((id) => ({
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
      product.attributes = dto.attributes.map((attr) => ({
        externalId: attr.id,
        name: attr.name,
        position: attr.position ?? 0,
        visible: attr.visible ?? true,
        variation: attr.variation ?? false,
        options: attr.options || [],
      }));
    }
    if (dto.defaultAttributes) {
      product.defaultAttributes = dto.defaultAttributes.map((attr) => ({
        externalId: attr.id,
        name: attr.name,
        option: attr.option,
      }));
    }

    // Other fields
    if (dto.groupedProducts) product.groupedProducts = dto.groupedProducts;
    if (dto.menuOrder !== undefined) product.menuOrder = dto.menuOrder;
    if (dto.metaData) {
      product.metaData = dto.metaData.map((m) => ({
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
   * Delete a product and all its variants
   */
  async delete(
    id: string,
    userId: string,
    deleteFromWoo = true,
  ): Promise<{ success: boolean; message: string; deletedVariants: number }> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new ResourceNotFoundException('Product', id);
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Delete from WooCommerce first
    if (deleteFromWoo && product.externalId) {
      const store = await this.storeModel
        .findById(product.storeId)
        .select('+credentials');
      if (
        store?.url &&
        store?.credentials?.consumerKey &&
        store?.credentials?.consumerSecret
      ) {
        try {
          await this.wooCommerceService.deleteProduct(
            {
              url: store.url,
              consumerKey: store.credentials.consumerKey,
              consumerSecret: store.credentials.consumerSecret,
            },
            product.externalId,
          );
        } catch (error) {
          this.logger.error(
            `Failed to delete product from WooCommerce: ${error.message}`,
          );
          // Continue with local deletion even if WooCommerce fails
        }
      }
    }

    // Soft delete all variants belonging to this product
    const variantDeleteResult = await this.variantModel.updateMany(
      { productId: product._id, isDeleted: false },
      { $set: { isDeleted: true } },
    );

    // Soft delete the product
    product.isDeleted = true;
    await product.save();

    return {
      success: true,
      message: 'Product and all variants deleted successfully',
      deletedVariants: variantDeleteResult.modifiedCount,
    };
  }

  /**
   * Update product stock
   */
  async updateStock(
    id: string,
    userId: string,
    dto: UpdateStockDto,
    pushToWoo = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new ResourceNotFoundException('Product', id);
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Update stock
    product.manageStock = true;
    product.stockQuantity = dto.quantity;

    // Update stock status based on quantity
    if (dto.quantity === 0) {
      product.stockStatus = StockStatus.OUT_OF_STOCK;
    } else if (
      product.lowStockAmount &&
      dto.quantity <= product.lowStockAmount
    ) {
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
    pushToWoo = true,
  ): Promise<{
    updated: number;
    failed: number;
    results: { id: string; success: boolean; error?: string }[];
  }> {
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
          results.push({
            id: productId,
            success: false,
            error: 'Product not found',
          });
          failed++;
          continue;
        }

        await this.verifyStoreAccess(product.storeId.toString(), userId);

        // Validate prices if being updated
        const regularPrice = dto.regularPrice ?? product.regularPrice;
        const salePrice = dto.salePrice ?? product.salePrice;
        this.validatePrices(regularPrice, salePrice);

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
        if (dto.attributes !== undefined) {
          // Look up store attributes to get externalIds
          const storeAttributes = await this.attributeModel.find({
            storeId: product.storeId,
            isDeleted: false,
          });
          const attrNameToExternalId = new Map(
            storeAttributes.map((attr) => [
              attr.name.toLowerCase(),
              attr.wooId,
            ]),
          );

          product.attributes = dto.attributes.map((a, idx) => ({
            // Use provided id, or look up by name, or default to 0
            externalId:
              a.id ?? attrNameToExternalId.get(a.name.toLowerCase()) ?? 0,
            name: a.name,
            position: a.position ?? idx,
            visible: a.visible ?? true,
            variation: a.variation ?? false,
            options: a.options || [],
          }));

          this.logger.log(
            `[bulkUpdate] Setting attributes for product ${productId}: ` +
              `${product.attributes.length} attributes - ${JSON.stringify(
                product.attributes.map((a) => ({
                  externalId: a.externalId,
                  name: a.name,
                  options: a.options,
                })),
              )}`,
          );
        }

        if (dto.categoryIds !== undefined) {
          const categoryDocs = await this.categoryModel
            .find({
              _id: { $in: dto.categoryIds.map((id) => new Types.ObjectId(id)) },
              storeId: product.storeId,
              isDeleted: false,
            })
            .select('externalId name slug');
          product.categories = categoryDocs.map((c) => ({
            externalId: c.externalId,
            name: c.name || '',
            slug: c.slug || '',
          }));
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
            product.regularPrice = Math.max(
              0,
              currentPrice - adjustment,
            ).toFixed(2);
          }
        }

        product.pendingSync = !pushToWoo;
        await product.save();

        if (pushToWoo && product.externalId) {
          try {
            await this.syncProductToWoo(product);
          } catch (syncError) {
            this.logger.warn(
              `Failed to sync product ${productId} to WooCommerce: ${syncError.message}`,
            );
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
   * Bulk update multiple variants (optimized with batch WooCommerce API)
   */
  async bulkUpdateVariants(
    userId: string,
    dto: BulkUpdateVariantDto,
    pushToWoo = true,
  ): Promise<{
    updated: number;
    failed: number;
    results: { id: string; success: boolean; error?: string }[];
  }> {
    this.logger.log(
      `[BulkUpdate] Starting bulk update for ${
        dto.variantIds?.length || 0
      } variants`,
    );
    this.logger.log(`[BulkUpdate] pushToWoo: ${pushToWoo}`);
    this.logger.log(
      `[BulkUpdate] DTO: ${JSON.stringify({
        ...dto,
        variantIds: dto.variantIds?.length + ' items',
      })}`,
    );

    const results: { id: string; success: boolean; error?: string }[] = [];
    let updated = 0;
    let failed = 0;

    // Validate prices if being set directly
    if (dto.regularPrice !== undefined && dto.salePrice !== undefined) {
      this.validatePrices(dto.regularPrice, dto.salePrice);
    }

    // Phase 1: Fetch all variants in one query and validate
    const variantObjectIds = dto.variantIds.map((id) => new Types.ObjectId(id));
    const variants = await this.variantModel.find({
      _id: { $in: variantObjectIds },
      isDeleted: false,
    });

    // Build a map for quick lookup
    const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

    // Check which IDs were not found
    const foundIds = new Set(variants.map((v) => v._id.toString()));
    for (const variantId of dto.variantIds) {
      if (!foundIds.has(variantId)) {
        results.push({
          id: variantId,
          success: false,
          error: 'Variant not found',
        });
        failed++;
      }
    }

    if (variants.length === 0) {
      return { updated, failed, results };
    }

    // Verify store access (only need to check once per store)
    const storeIds = [...new Set(variants.map((v) => v.storeId.toString()))];
    for (const storeId of storeIds) {
      await this.verifyStoreAccess(storeId, userId);
    }

    // Phase 2: Build MongoDB update and apply in bulk
    const updateFields: any = { pendingSync: !pushToWoo };
    if (dto.status !== undefined) updateFields.status = dto.status;
    if (dto.manageStock !== undefined)
      updateFields.manageStock = dto.manageStock;
    if (dto.stockQuantity !== undefined) {
      updateFields.stockQuantity = dto.stockQuantity;
      updateFields.stockStatus =
        dto.stockQuantity === 0
          ? StockStatus.OUT_OF_STOCK
          : StockStatus.IN_STOCK;
    }
    if (dto.stockStatus !== undefined)
      updateFields.stockStatus = dto.stockStatus;
    if (dto.regularPrice !== undefined)
      updateFields.regularPrice = dto.regularPrice;
    if (dto.salePrice !== undefined) updateFields.salePrice = dto.salePrice;

    // Handle price adjustment (requires per-variant calculation)
    if (dto.priceAdjustment) {
      // Price adjustment needs individual calculation, use bulkWrite
      const bulkOps = variants.map((variant) => {
        const currentPrice = parseFloat(variant.regularPrice || '0');
        let adjustment = dto.priceAdjustment.value;
        if (dto.priceAdjustment.method === 'percentage') {
          adjustment = currentPrice * (dto.priceAdjustment.value / 100);
        }
        const newPrice =
          dto.priceAdjustment.type === 'increase'
            ? (currentPrice + adjustment).toFixed(2)
            : Math.max(0, currentPrice - adjustment).toFixed(2);

        return {
          updateOne: {
            filter: { _id: variant._id },
            update: { $set: { ...updateFields, regularPrice: newPrice } },
          },
        };
      });

      await this.variantModel.bulkWrite(bulkOps);
      this.logger.log(
        `[BulkUpdate] Bulk updated ${variants.length} variants locally (with price adjustment)`,
      );
    } else {
      // Simple updateMany for all variants at once
      await this.variantModel.updateMany(
        { _id: { $in: variantObjectIds } },
        { $set: updateFields },
      );
      this.logger.log(
        `[BulkUpdate] Bulk updated ${variants.length} variants locally via updateMany`,
      );
    }

    // Mark all found variants as successful
    for (const variant of variants) {
      results.push({ id: variant._id.toString(), success: true });
      updated++;
    }

    // Phase 3: Batch sync to WooCommerce (grouped by product)
    if (pushToWoo) {
      // Group variants by parent product
      const variantsByProduct = new Map<
        string,
        {
          variant: ProductVariantDocument;
          parentExternalId: number;
          storeId: string;
        }[]
      >();

      for (const variant of variants) {
        if (variant.externalId && variant.parentExternalId) {
          const productKey = variant.productId.toString();
          if (!variantsByProduct.has(productKey)) {
            variantsByProduct.set(productKey, []);
          }
          variantsByProduct.get(productKey).push({
            variant,
            parentExternalId: variant.parentExternalId,
            storeId: variant.storeId.toString(),
          });
        }
      }

      if (variantsByProduct.size > 0) {
        this.logger.log(
          `[BulkUpdate] Starting batch WooCommerce sync for ${variantsByProduct.size} product(s)`,
        );

        // Re-fetch updated variants to get the latest values after updateMany
        const updatedVariants = await this.variantModel.find({
          _id: { $in: variantObjectIds },
          isDeleted: false,
        });
        const updatedMap = new Map(
          updatedVariants.map((v) => [v._id.toString(), v]),
        );

        for (const [productId, productVariants] of variantsByProduct) {
          try {
            const { parentExternalId, storeId } = productVariants[0];

            const store = await this.storeModel
              .findById(storeId)
              .select('+credentials');

            if (
              !store?.credentials?.consumerKey ||
              !store?.credentials?.consumerSecret
            ) {
              this.logger.warn(
                `[BulkUpdate] Skipping WooCommerce sync for product ${productId} - missing credentials`,
              );
              continue;
            }

            const credentials = {
              url: store.url,
              consumerKey: store.credentials.consumerKey,
              consumerSecret: store.credentials.consumerSecret,
            };

            // Build batch update payload from refreshed data
            const updatePayload = productVariants.map(({ variant }) => {
              const fresh = updatedMap.get(variant._id.toString()) || variant;
              const updateData: any = {
                id: fresh.externalId,
              };

              if (
                fresh.regularPrice !== undefined &&
                fresh.regularPrice !== null
              ) {
                updateData.regular_price = String(fresh.regularPrice);
              }
              if (fresh.salePrice !== undefined && fresh.salePrice !== null) {
                updateData.sale_price = String(fresh.salePrice);
              } else {
                updateData.sale_price = '';
              }

              if (dto.status !== undefined) updateData.status = fresh.status;
              if (dto.manageStock !== undefined)
                updateData.manage_stock = fresh.manageStock;
              if (dto.stockQuantity !== undefined)
                updateData.stock_quantity = fresh.stockQuantity;
              if (dto.stockStatus !== undefined)
                updateData.stock_status = fresh.stockStatus;

              return updateData;
            });

            this.logger.log(
              `[BulkUpdate] Batch updating ${updatePayload.length} variants for product ${parentExternalId}`,
            );

            await this.wooCommerceService.batchVariations(
              credentials,
              parentExternalId,
              { update: updatePayload },
            );

            this.logger.log(
              `[BulkUpdate] Successfully batch synced ${updatePayload.length} variants for product ${parentExternalId}`,
            );
          } catch (syncError) {
            this.logger.error(
              `[BulkUpdate] Failed to batch sync variants for product ${productId}: ${syncError.message}`,
              syncError.stack,
            );
          }
        }
      }
    }

    return { updated, failed, results };
  }

  /**
   * Bulk delete multiple variants
   */
  async bulkDeleteVariants(
    userId: string,
    variantIds: string[],
    pushToWoo = true,
  ): Promise<{
    deleted: number;
    failed: number;
    results: { id: string; success: boolean; error?: string }[];
  }> {
    this.logger.log(
      `[BulkDelete] Starting bulk delete for ${variantIds.length} variants, pushToWoo: ${pushToWoo}`,
    );
    const results: { id: string; success: boolean; error?: string }[] = [];
    let deleted = 0;
    let failed = 0;

    // Group variants by parent product for batch WooCommerce operations
    const variantsByProduct = new Map<
      string,
      { variant: any; productId: string; parentExternalId: number }[]
    >();

    // First, gather all variants and group by product
    for (const variantId of variantIds) {
      try {
        const variant = await this.variantModel.findOne({
          _id: new Types.ObjectId(variantId),
          isDeleted: false,
        });

        if (!variant) {
          results.push({
            id: variantId,
            success: false,
            error: 'Variant not found',
          });
          failed++;
          continue;
        }

        await this.verifyStoreAccess(variant.storeId.toString(), userId);

        const productKey = variant.productId.toString();
        if (!variantsByProduct.has(productKey)) {
          variantsByProduct.set(productKey, []);
        }
        variantsByProduct.get(productKey).push({
          variant,
          productId: productKey,
          parentExternalId: variant.parentExternalId,
        });
      } catch (error) {
        results.push({ id: variantId, success: false, error: error.message });
        failed++;
      }
    }

    this.logger.log(
      `[BulkDelete] Grouped variants into ${variantsByProduct.size} product(s)`,
    );

    // Process each product group
    for (const [productId, variants] of variantsByProduct) {
      try {
        // Get store credentials
        const firstVariant = variants[0].variant;
        const store = await this.storeModel
          .findById(firstVariant.storeId)
          .select('+credentials');

        if (!store) {
          for (const v of variants) {
            results.push({
              id: v.variant._id.toString(),
              success: false,
              error: 'Store not found',
            });
            failed++;
          }
          continue;
        }

        // Delete from WooCommerce using batch API if pushing to WooCommerce
        if (pushToWoo) {
          // Get parentExternalId - try from variant first, then from parent product
          let parentExternalId = variants[0].parentExternalId;

          if (!parentExternalId) {
            // Fallback: get from parent product
            const parentProduct = await this.productModel.findById(productId);
            parentExternalId = parentProduct?.externalId;
            if (!parentExternalId) {
              this.logger.warn(
                `[BulkDelete] Skipping WooCommerce delete for product ${productId} - no parent externalId found`,
              );
            }
          }

          if (parentExternalId) {
            const credentials = {
              url: store.url,
              consumerKey: store.credentials.consumerKey,
              consumerSecret: store.credentials.consumerSecret,
            };

            const deleteIds = variants
              .filter((v) => v.variant.externalId)
              .map((v) => v.variant.externalId);

            if (deleteIds.length > 0) {
              try {
                // Chunk into batches of 25 to avoid 413 Payload Too Large
                const chunkSize = 25;
                for (
                  let i = 0;
                  i < deleteIds.length;
                  i += chunkSize
                ) {
                  const chunk = deleteIds.slice(i, i + chunkSize);
                  this.logger.log(
                    `[BulkDelete] Batch deleting chunk ${Math.floor(i / chunkSize) + 1} (${chunk.length} variants) from WooCommerce (product ${parentExternalId})`,
                  );
                  await this.wooCommerceService.batchVariations(
                    credentials,
                    parentExternalId,
                    { delete: chunk },
                  );
                }
                this.logger.log(
                  `[BulkDelete] Successfully batch deleted ${deleteIds.length} variants from WooCommerce`,
                );
              } catch (wooError) {
                this.logger.warn(
                  `[BulkDelete] Failed to batch delete variants from WooCommerce: ${wooError.message}`,
                );
              }
            } else {
              this.logger.warn(
                `[BulkDelete] No variants with externalId found for WooCommerce delete`,
              );
            }
          }
        }

        // Soft delete in local database (batch operation)
        this.logger.log(
          `[BulkDelete] Batch soft-deleting ${variants.length} variants locally for product ${productId}`,
        );
        const variantIdsToDelete = variants.map(
          (v) => new Types.ObjectId(v.variant._id),
        );
        const externalIdsToRemove = variants
          .filter((v) => v.variant.externalId)
          .map((v) => v.variant.externalId);

        try {
          // Batch soft-delete all variants
          await this.variantModel.updateMany(
            { _id: { $in: variantIdsToDelete } },
            { isDeleted: true },
          );

          // Update parent product once with all changes
          await this.productModel.findByIdAndUpdate(productId, {
            $inc: { variationCount: -variants.length },
            $pull: { variationIds: { $in: externalIdsToRemove } },
          });

          // Mark all as successful
          for (const v of variants) {
            results.push({ id: v.variant._id.toString(), success: true });
            deleted++;
          }
        } catch (err) {
          for (const v of variants) {
            results.push({
              id: v.variant._id.toString(),
              success: false,
              error: err.message,
            });
            failed++;
          }
        }
      } catch (error) {
        for (const v of variants) {
          results.push({
            id: v.variant._id.toString(),
            success: false,
            error: error.message,
          });
          failed++;
        }
      }
    }

    return { deleted, failed, results };
  }

  /**
   * Update a single variant locally and optionally push to WooCommerce
   */
  async updateVariant(
    variantId: string,
    userId: string,
    dto: UpdateVariantDto,
    pushToWoo = true,
  ): Promise<IProductVariant> {
    const variant = await this.variantModel.findOne({
      _id: new Types.ObjectId(variantId),
      isDeleted: false,
    });

    if (!variant) {
      throw new ResourceNotFoundException('ProductVariant', variantId);
    }

    await this.verifyStoreAccess(variant.storeId.toString(), userId);

    // Validate prices - use provided values or fall back to existing
    const regularPrice = dto.regularPrice ?? variant.regularPrice;
    const salePrice = dto.salePrice ?? variant.salePrice;
    this.validatePrices(regularPrice, salePrice);

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
    if (dto.image !== undefined) {
      variant.image = dto.image ? { ...dto.image, position: 0 } : null;
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
   * Delete a variant
   */
  async deleteVariant(
    variantId: string,
    userId: string,
    deleteFromWoo = true,
  ): Promise<{ success: boolean; message: string }> {
    const variant = await this.variantModel.findOne({
      _id: new Types.ObjectId(variantId),
      isDeleted: false,
    });

    if (!variant) {
      throw new ResourceNotFoundException('ProductVariant', variantId);
    }

    await this.verifyStoreAccess(variant.storeId.toString(), userId);

    // Get the parent product for WooCommerce sync
    const product = await this.productModel.findById(variant.productId);
    if (!product) {
      throw new ResourceNotFoundException(
        'Product',
        variant.productId.toString(),
      );
    }

    // Delete from WooCommerce first
    if (deleteFromWoo && variant.externalId && product.externalId) {
      const store = await this.storeModel
        .findById(variant.storeId)
        .select('+credentials');
      if (
        store?.url &&
        store?.credentials?.consumerKey &&
        store?.credentials?.consumerSecret
      ) {
        try {
          await this.wooCommerceService.deleteVariation(
            {
              url: store.url,
              consumerKey: store.credentials.consumerKey,
              consumerSecret: store.credentials.consumerSecret,
            },
            product.externalId,
            variant.externalId,
          );
        } catch (error) {
          this.logger.error(
            `Failed to delete variant from WooCommerce: ${error.message}`,
          );
          // Continue with local deletion even if WooCommerce fails
        }
      }
    }

    // Soft delete the variant locally
    variant.isDeleted = true;
    await variant.save();

    // Update parent product variation count
    const remainingVariantsCount = await this.variantModel.countDocuments({
      productId: product._id,
      isDeleted: false,
    });
    product.variationCount = remainingVariantsCount;
    await product.save();

    return { success: true, message: 'Variant deleted successfully' };
  }

  /**
   * Get variant by ID
   */
  async findVariantById(
    variantId: string,
    userId: string,
  ): Promise<IProductVariant> {
    const variant = await this.variantModel.findOne({
      _id: new Types.ObjectId(variantId),
      isDeleted: false,
    });

    if (!variant) {
      throw new ResourceNotFoundException('ProductVariant', variantId);
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
      throw new ResourceNotFoundException(
        'Product',
        variant.productId.toString(),
      );
    }

    // Check if product has externalId (is synced to WooCommerce)
    if (!product.externalId) {
      this.logger.warn(
        `Cannot sync variant - parent product ${product._id} has no externalId`,
      );
      throw new ValidationException(
        'product.externalId',
        'parent product must be synced to WooCommerce first',
        { productId: product._id.toString() },
      );
    }

    // Check if variant has externalId
    if (!variant.externalId) {
      this.logger.warn(
        `Cannot sync variant ${variant._id} - has no externalId`,
      );
      throw new ValidationException(
        'variant.externalId',
        'variant must be synced to WooCommerce first',
        { variantId: variant._id.toString() },
      );
    }

    const store = await this.storeModel
      .findById(variant.storeId)
      .select('+credentials');

    if (!store) {
      throw new ResourceNotFoundException('Store', variant.storeId.toString());
    }

    if (!store.credentials?.consumerKey || !store.credentials?.consumerSecret) {
      throw new ValidationException(
        'store.credentials',
        'WooCommerce credentials are not configured',
        { storeId: store._id.toString() },
      );
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    const updateData: any = {
      sku: variant.sku || '',
      status: variant.status as 'publish' | 'pending' | 'draft' | 'private',
      manage_stock: variant.manageStock,
      stock_quantity: variant.stockQuantity,
      stock_status: variant.stockStatus as
        | 'instock'
        | 'outofstock'
        | 'onbackorder',
    };

    // Only include prices if they have values
    // WooCommerce requires string prices, and empty string clears the price
    if (variant.regularPrice !== undefined && variant.regularPrice !== null) {
      updateData.regular_price = String(variant.regularPrice);
    }
    if (variant.salePrice !== undefined && variant.salePrice !== null) {
      updateData.sale_price = String(variant.salePrice);
    } else {
      // If no sale price, explicitly set to empty string to clear it
      updateData.sale_price = '';
    }

    // Include image if it exists
    if (variant.image?.src) {
      updateData.image = { src: variant.image.src };
    }

    this.logger.log(
      `[Sync] Updating variation ${
        variant.externalId
      } with data: ${JSON.stringify(updateData)}`,
    );

    await this.wooCommerceService.updateVariation(
      credentials,
      product.externalId,
      variant.externalId,
      updateData,
    );

    this.logger.log(
      `[Sync] Successfully synced variation ${variant.externalId} to WooCommerce`,
    );

    variant.pendingSync = false;
    variant.lastSyncedAt = new Date();
    await variant.save();
  }

  /**
   * Get all unique variant attributes for filtering
   * @param categoryId - Optional category ID or slug to filter attributes by products in that category
   */
  async getVariantAttributes(
    userId: string,
    storeId?: string,
    categoryId?: string,
  ): Promise<{ [attributeName: string]: string[] }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    // If categoryId is provided, first get all product IDs in that category
    let productIdsInCategory: Types.ObjectId[] | null = null;
    if (categoryId && storeId) {
      const categoryFilter: any = {
        storeId: new Types.ObjectId(storeId),
        isDeleted: false,
        type: 'variable', // Only variable products have variants
      };

      // Check if categoryId is numeric (WooCommerce ID) or a slug
      const numericId = parseInt(categoryId, 10);
      if (!isNaN(numericId) && String(numericId) === categoryId) {
        categoryFilter['categories.externalId'] = numericId;
      } else {
        categoryFilter['categories.slug'] = categoryId;
      }

      const productsInCategory = await this.productModel.find(categoryFilter, {
        _id: 1,
      });
      productIdsInCategory = productsInCategory.map((p) => p._id);

      // If no products in category, return empty
      if (productIdsInCategory.length === 0) {
        return {};
      }

      filter.productId = { $in: productIdsInCategory };
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

    this.logger.log(
      `[getVariantAttributes] Aggregation result count: ${result.length}`,
    );

    const attributes: { [key: string]: string[] } = {};
    result.forEach((item: { _id: string; options: string[] }) => {
      attributes[item._id] = item.options.sort();
    });

    return attributes;
  }

  /**
   * Search variants by attributes
   * @param categoryId - Optional category ID or slug to filter variants by products in that category
   */
  async searchVariantsByAttributes(
    userId: string,
    storeId: string,
    attributeFilters: { name: string; values: string[] }[],
    categoryId?: string,
  ): Promise<{ variants: IProductVariant[]; total: number }> {
    this.logger.log(
      `[searchVariantsByAttributes] Searching with filters: ${JSON.stringify(attributeFilters)}, storeId: ${storeId}, categoryId: ${categoryId}`,
    );

    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    // If categoryId is provided, first get all product IDs in that category
    if (categoryId && storeId) {
      const categoryFilter: any = {
        storeId: new Types.ObjectId(storeId),
        isDeleted: false,
        type: 'variable',
      };

      // Check if categoryId is a slug or numeric external ID
      if (/^\d+$/.test(categoryId)) {
        categoryFilter['categories.externalId'] = parseInt(categoryId);
      } else {
        categoryFilter['categories.slug'] = categoryId;
      }

      const productsInCategory = await this.productModel.find(categoryFilter, {
        _id: 1,
      });
      const productIdsInCategory = productsInCategory.map((p) => p._id);

      if (productIdsInCategory.length === 0) {
        return { variants: [], total: 0 };
      }

      filter.productId = { $in: productIdsInCategory };
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

    this.logger.log(
      `[searchVariantsByAttributes] Final filter: ${JSON.stringify(filter)}`,
    );

    const variants = await this.variantModel
      .find(filter)
      .populate('productId', 'name')
      .limit(500);

    this.logger.log(
      `[searchVariantsByAttributes] Found ${variants.length} variants`,
    );

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

    const products = await this.productModel
      .find(filter)
      .sort({ stockQuantity: 1 })
      .limit(100);

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
      throw new ResourceNotFoundException('Store', product.storeId.toString());
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
      if (product.globalUniqueId)
        wooUpdateData.global_unique_id = product.globalUniqueId;
      if (product.dateOnSaleFrom)
        wooUpdateData.date_on_sale_from = product.dateOnSaleFrom.toISOString();
      if (product.dateOnSaleFromGmt)
        wooUpdateData.date_on_sale_from_gmt =
          product.dateOnSaleFromGmt.toISOString();
      if (product.dateOnSaleTo)
        wooUpdateData.date_on_sale_to = product.dateOnSaleTo.toISOString();
      if (product.dateOnSaleToGmt)
        wooUpdateData.date_on_sale_to_gmt =
          product.dateOnSaleToGmt.toISOString();
      if (product.virtual !== undefined)
        wooUpdateData.virtual = product.virtual;
      if (product.downloadable !== undefined)
        wooUpdateData.downloadable = product.downloadable;
      if (product.downloads?.length)
        wooUpdateData.downloads = product.downloads;
      if (product.downloadLimit !== undefined)
        wooUpdateData.download_limit = product.downloadLimit;
      if (product.downloadExpiry !== undefined)
        wooUpdateData.download_expiry = product.downloadExpiry;
      if (product.externalUrl) wooUpdateData.external_url = product.externalUrl;
      if (product.buttonText) wooUpdateData.button_text = product.buttonText;
      if (product.taxStatus) wooUpdateData.tax_status = product.taxStatus;
      if (product.taxClass !== undefined)
        wooUpdateData.tax_class = product.taxClass;
      if (product.backorders) wooUpdateData.backorders = product.backorders;
      if (product.soldIndividually !== undefined)
        wooUpdateData.sold_individually = product.soldIndividually;
      if (product.weight) wooUpdateData.weight = product.weight;
      if (product.dimensions) wooUpdateData.dimensions = product.dimensions;
      if (product.shippingClass)
        wooUpdateData.shipping_class = product.shippingClass;
      if (product.reviewsAllowed !== undefined)
        wooUpdateData.reviews_allowed = product.reviewsAllowed;
      if (product.upsellIds?.length)
        wooUpdateData.upsell_ids = product.upsellIds;
      if (product.crossSellIds?.length)
        wooUpdateData.cross_sell_ids = product.crossSellIds;
      if (product.parentId) wooUpdateData.parent_id = product.parentId;
      if (product.purchaseNote)
        wooUpdateData.purchase_note = product.purchaseNote;
      if (product.categories?.length) {
        wooUpdateData.categories = product.categories.map((c) => ({
          id: c.externalId,
        }));
      }
      if (product.tags?.length) {
        wooUpdateData.tags = product.tags.map((t) => ({ id: t.externalId }));
      }
      if (product.images?.length) {
        wooUpdateData.images = product.images.map((img) => ({
          id: img.externalId,
          src: img.src,
          name: img.name,
          alt: img.alt,
        }));
      }
      // Look up store attributes to get correct externalIds if missing
      const storeAttributes = await this.attributeModel.find({
        storeId: product.storeId,
        isDeleted: false,
      });
      const attrNameToExternalId = new Map(
        storeAttributes.map((attr) => [attr.name.toLowerCase(), attr.wooId]),
      );

      // Always send attributes to WooCommerce, even if empty (to clear them)
      // Also fix any missing externalIds in the product's attributes
      // Filter out orphan attributes (those not in store's attribute list)
      let attributesNeedUpdate = false;
      const validAttributes: any[] = [];
      const orphanAttributes: string[] = [];

      (product.attributes || []).forEach((a, idx) => {
        const resolvedId =
          a.externalId || attrNameToExternalId.get(a.name.toLowerCase()) || 0;

        // Skip orphan attributes (not in store's attribute list)
        if (!resolvedId) {
          orphanAttributes.push(a.name);
          return;
        }

        // Update the product's attribute with the resolved externalId if it was missing
        if (!a.externalId && resolvedId) {
          product.attributes[idx].externalId = resolvedId;
          attributesNeedUpdate = true;
        }

        validAttributes.push({
          id: resolvedId,
          name: a.name,
          position: a.position,
          visible: a.visible,
          variation: a.variation,
          options: a.options,
        });
      });

      wooUpdateData.attributes = validAttributes;

      if (orphanAttributes.length > 0) {
        this.logger.warn(
          `[syncProductToWoo] Filtered out ${orphanAttributes.length} orphan attributes ` +
            `(not in store's attribute list): ${orphanAttributes.join(', ')}`,
        );
      }

      // Save the fixed externalIds to the database
      if (attributesNeedUpdate) {
        this.logger.log(
          `[syncProductToWoo] Fixed missing externalIds for product ${product._id}`,
        );
      }

      this.logger.log(
        `[syncProductToWoo] Product ${product._id} (externalId: ${product.externalId}) - ` +
          `Sending ${
            wooUpdateData.attributes.length
          } attributes to WooCommerce: ${JSON.stringify(
            wooUpdateData.attributes.map((a) => ({
              id: a.id,
              name: a.name,
              options: a.options,
            })),
          )}`,
      );
      if (product.defaultAttributes?.length) {
        wooUpdateData.default_attributes = product.defaultAttributes.map(
          (a) => ({
            id: a.externalId,
            name: a.name,
            option: a.option,
          }),
        );
      }
      if (product.groupedProducts?.length)
        wooUpdateData.grouped_products = product.groupedProducts;
      if (product.menuOrder !== undefined)
        wooUpdateData.menu_order = product.menuOrder;
      if (product.metaData?.length) {
        wooUpdateData.meta_data = product.metaData.map((m) => ({
          id: m.externalId,
          key: m.key,
          value: m.value,
        }));
      }

      const wooResult = await this.wooCommerceService.updateProduct(
        credentials,
        product.externalId,
        wooUpdateData,
      );

      this.logger.log(
        `[syncProductToWoo] WooCommerce response for product ${product._id}: ` +
          `attributes returned = ${
            wooResult?.attributes?.length ?? 'undefined'
          }, ` +
          `attribute names: ${JSON.stringify(
            wooResult?.attributes?.map((a: any) => a.name) || [],
          )}`,
      );

      product.pendingSync = false;
      product.lastSyncedAt = new Date();
      await product.save();
    } catch (error) {
      this.logger.error(
        `Failed to sync product to WooCommerce: ${error.message}`,
        error.stack,
      );
      throw new InvalidInputException(
        'product sync',
        `Failed to sync to WooCommerce: ${error.message}`,
        'Valid product data compatible with WooCommerce API',
      );
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
      throw new ResourceNotFoundException('Store', product.storeId.toString());
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
      dateOnSaleFrom: wooProduct.date_on_sale_from
        ? new Date(wooProduct.date_on_sale_from)
        : null,
      dateOnSaleFromGmt: wooProduct.date_on_sale_from_gmt
        ? new Date(wooProduct.date_on_sale_from_gmt)
        : null,
      dateOnSaleTo: wooProduct.date_on_sale_to
        ? new Date(wooProduct.date_on_sale_to)
        : null,
      dateOnSaleToGmt: wooProduct.date_on_sale_to_gmt
        ? new Date(wooProduct.date_on_sale_to_gmt)
        : null,
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
      categories:
        wooProduct.categories?.map((c: any) => ({
          externalId: c.id,
          name: c.name,
          slug: c.slug,
        })) || [],
      tags:
        wooProduct.tags?.map((t: any) => ({
          externalId: t.id,
          name: t.name,
          slug: t.slug,
        })) || [],
      images:
        wooProduct.images?.map((img: any, idx: number) => ({
          externalId: img.id,
          src: img.src,
          name: img.name || '',
          alt: img.alt || '',
          position: idx,
        })) || [],
      attributes:
        wooProduct.attributes?.map((a: any) => ({
          externalId: a.id,
          name: a.name,
          position: a.position,
          visible: a.visible,
          variation: a.variation,
          options: a.options || [],
        })) || [],
      defaultAttributes:
        wooProduct.default_attributes?.map((a: any) => ({
          externalId: a.id,
          name: a.name,
          option: a.option,
        })) || [],
      variationIds: wooProduct.variations || [],
      variationCount: wooProduct.variations?.length || 0,
      groupedProducts: wooProduct.grouped_products || [],
      menuOrder: wooProduct.menu_order || 0,
      purchaseNote: wooProduct.purchase_note || '',
      metaData:
        wooProduct.meta_data?.map((m: any) => ({
          externalId: m.id,
          key: m.key,
          value: m.value,
        })) || [],
      parentId: wooProduct.parent_id,
      dateCreatedWoo: wooProduct.date_created
        ? new Date(wooProduct.date_created)
        : null,
      dateCreatedGmtWoo: wooProduct.date_created_gmt
        ? new Date(wooProduct.date_created_gmt)
        : null,
      dateModifiedWoo: wooProduct.date_modified
        ? new Date(wooProduct.date_modified)
        : null,
      dateModifiedGmtWoo: wooProduct.date_modified_gmt
        ? new Date(wooProduct.date_modified_gmt)
        : null,
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
      attributes: (wooVariant.attributes || []).map((attr) => ({
        externalId: attr.id,
        name: attr.name,
        option: attr.option,
      })),
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
   * Backfill variant attributes by deriving them from parent product attribute definitions.
   * Used when WooCommerce variations have empty attributes (e.g., after import).
   * Matches variants to attribute combinations by creation order (externalId).
   */
  async backfillVariantAttributes(
    userId: string,
    storeId: string,
  ): Promise<{ updated: number; failed: number; skipped: number; total: number }> {
    await this.verifyStoreAccess(storeId, userId);

    // Find variants with empty attributes
    const emptyVariants = await this.variantModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      $or: [
        { attributes: { $exists: false } },
        { attributes: { $size: 0 } },
      ],
    });

    this.logger.log(
      `[backfillVariantAttributes] Found ${emptyVariants.length} variants with empty attributes for store ${storeId}`,
    );

    if (emptyVariants.length === 0) {
      return { updated: 0, failed: 0, skipped: 0, total: 0 };
    }

    // Group variants by productId
    const variantsByProduct = new Map<string, ProductVariantDocument[]>();
    for (const variant of emptyVariants) {
      const productId = variant.productId.toString();
      if (!variantsByProduct.has(productId)) {
        variantsByProduct.set(productId, []);
      }
      variantsByProduct.get(productId).push(variant);
    }

    let updated = 0;
    let failed = 0;
    let skipped = 0;
    let productIndex = 0;
    const totalProducts = variantsByProduct.size;

    this.logger.log(
      `[backfillVariantAttributes] Processing ${totalProducts} parent products`,
    );

    // Cartesian product helper
    const generateCombinations = (arrays: string[][]): string[][] => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCombinations = generateCombinations(rest);
      return first.flatMap((item) =>
        restCombinations.map((combo) => [item, ...combo]),
      );
    };

    for (const [productId, variants] of variantsByProduct) {
      productIndex++;
      try {
        // Get parent product from local DB
        const product = await this.productModel.findById(productId);
        if (!product) {
          this.logger.warn(
            `[backfillVariantAttributes] [${productIndex}/${totalProducts}] Parent product ${productId} not found, skipping ${variants.length} variants`,
          );
          skipped += variants.length;
          continue;
        }

        // Get variation attributes (variation: true with options)
        const variationAttributes = product.attributes.filter(
          (attr) => attr.variation && attr.options?.length > 0,
        );

        if (variationAttributes.length === 0) {
          this.logger.warn(
            `[backfillVariantAttributes] [${productIndex}/${totalProducts}] Product "${product.name}" has no variation attributes, skipping ${variants.length} variants`,
          );
          skipped += variants.length;
          continue;
        }

        // Generate all attribute combinations
        const optionArrays = variationAttributes.map((attr) => attr.options);
        const allCombinations = generateCombinations(optionArrays);

        // Sort variants by externalId (creation order)
        const sortedVariants = [...variants].sort(
          (a, b) => a.externalId - b.externalId,
        );

        this.logger.log(
          `[backfillVariantAttributes] [${productIndex}/${totalProducts}] Product "${product.name}": ${variationAttributes.length} attributes, ${allCombinations.length} combinations, ${sortedVariants.length} variants`,
        );

        if (allCombinations.length !== sortedVariants.length) {
          this.logger.warn(
            `[backfillVariantAttributes] Mismatch: ${allCombinations.length} combinations vs ${sortedVariants.length} variants for "${product.name}". Assigning what we can.`,
          );
        }

        // Build bulk operations
        const bulkOps = [];
        for (let i = 0; i < sortedVariants.length; i++) {
          if (i < allCombinations.length) {
            const combo = allCombinations[i];
            const attrs = variationAttributes.map((attr, attrIndex) => ({
              externalId: attr.externalId,
              name: attr.name,
              option: combo[attrIndex],
            }));
            bulkOps.push({
              updateOne: {
                filter: { _id: sortedVariants[i]._id },
                update: { $set: { attributes: attrs } },
              },
            });
            updated++;
          } else {
            failed++;
          }
        }

        if (bulkOps.length > 0) {
          await this.variantModel.bulkWrite(bulkOps);
        }

        this.logger.log(
          `[backfillVariantAttributes] [${productIndex}/${totalProducts}] Assigned ${bulkOps.length} combinations for "${product.name}"`,
        );
      } catch (error) {
        this.logger.error(
          `[backfillVariantAttributes] Failed for product ${productId}: ${error.message}`,
        );
        failed += variants.length;
      }
    }

    this.logger.log(
      `[backfillVariantAttributes] Done. Updated: ${updated}, Failed: ${failed}, Skipped: ${skipped}, Total: ${emptyVariants.length}`,
    );

    return { updated, failed, skipped, total: emptyVariants.length };
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
        (product.shortDescription || '')
          .replace(/<[^>]+>/g, '')
          .substring(0, 200),
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
    const csvContent =
      BOM +
      [
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
    overview: {
      totalProducts: number;
      activeProducts: number;
      draftProducts: number;
      outOfStock: number;
      lowStock: number;
    };
    stockDistribution: {
      inStock: number;
      outOfStock: number;
      onBackorder: number;
      lowStock: number;
    };
    categoryBreakdown: {
      categoryName: string;
      productCount: number;
      avgPrice: number;
    }[];
    priceRanges: { range: string; count: number }[];
    topRatedProducts: {
      productId: string;
      name: string;
      avgRating: number;
      reviewCount: number;
      image?: string;
    }[];
    recentlyAdded: {
      productId: string;
      name: string;
      dateAdded: Date;
      status: string;
      image?: string;
    }[];
    stockAlerts: {
      productId: string;
      name: string;
      sku: string;
      stockQuantity: number;
      threshold: number;
      image?: string;
    }[];
    typeDistribution: { type: string; count: number }[];
    priceStats: {
      minPrice: number;
      maxPrice: number;
      avgPrice: number;
      totalValue: number;
    };
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
      this.productModel.countDocuments({
        ...filter,
        stockStatus: StockStatus.OUT_OF_STOCK,
      }),
      this.productModel.countDocuments({
        ...filter,
        manageStock: true,
        $expr: {
          $lte: ['$stockQuantity', { $ifNull: ['$lowStockAmount', 10] }],
        },
      }),
    ]);

    const [inStock, onBackorder] = await Promise.all([
      this.productModel.countDocuments({
        ...filter,
        stockStatus: StockStatus.IN_STOCK,
      }),
      this.productModel.countDocuments({
        ...filter,
        stockStatus: StockStatus.ON_BACKORDER,
      }),
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
      '0': '0-50',
      '50': '50-100',
      '100': '100-250',
      '250': '250-500',
      '500': '500-1K',
      '1000': '1K-5K',
      '5000': '5K+',
      Other: 'Other',
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
        $expr: {
          $lte: ['$stockQuantity', { $ifNull: ['$lowStockAmount', 10] }],
        },
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

    const stats = priceStats[0] || {
      minPrice: 0,
      maxPrice: 0,
      avgPrice: 0,
      totalValue: 0,
    };

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
      categoryId?: string;
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

    // Category filter - find products in category first, then filter variants
    if (query.categoryId && query.storeId) {
      const categoryFilter: any = {
        storeId: new Types.ObjectId(query.storeId),
        isDeleted: false,
        type: 'variable',
      };

      // Check if categoryId is a slug or numeric external ID
      if (/^\d+$/.test(query.categoryId)) {
        categoryFilter['categories.externalId'] = parseInt(query.categoryId);
      } else {
        categoryFilter['categories.slug'] = query.categoryId;
      }

      const productsInCategory = await this.productModel.find(categoryFilter, {
        _id: 1,
      });
      const productIdsInCategory = productsInCategory.map((p) => p._id);

      if (productIdsInCategory.length === 0) {
        // No products in this category, return empty result
        return {
          variants: [],
          pagination: {
            total: 0,
            page: query.page || 1,
            size: query.size || 50,
            pages: 0,
          },
        };
      }

      filter.productId = { $in: productIdsInCategory };
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
          $gte: [
            { $toDouble: { $ifNull: ['$price', '$regularPrice'] } },
            query.minPrice,
          ],
        });
      }
      if (query.maxPrice !== undefined) {
        filter.$expr.$and.push({
          $lte: [
            { $toDouble: { $ifNull: ['$price', '$regularPrice'] } },
            query.maxPrice,
          ],
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

    const productIds = [
      ...new Set(variants.map((v) => v.productId.toString())),
    ];
    const products = await this.productModel
      .find({
        _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('_id name');

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
    images: {
      src: string;
      alt?: string;
      name?: string;
      position?: number;
      externalId?: number;
    }[],
    pushToWoo = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new ResourceNotFoundException('Product', id);
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Track existing images for deletion detection
    const existingImages = [...product.images];
    const newImageSrcs = new Set(images.map((img) => img.src));

    // Find images that were removed (exist in old but not in new)
    const removedImages = existingImages.filter(
      (img) => !newImageSrcs.has(img.src),
    );

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
      this.deleteRemovedImages(product.storeId.toString(), removedImages).catch(
        (error) => {
          this.logger.warn(
            `Failed to delete some removed images: ${error.message}`,
          );
        },
      );
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
          await this.wooCommerceService.deleteMedia(
            credentials,
            img.externalId,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to delete WordPress media ID ${img.externalId}: ${error.message}`,
          );
        }
      }

      // Delete from S3 if it's an S3 URL
      if (img.src && this.isS3Url(img.src)) {
        try {
          this.logger.log(`Deleting S3 image: ${img.src}`);
          await this.s3UploadService.deleteFile(img.src);
        } catch (error) {
          this.logger.warn(
            `Failed to delete S3 image ${img.src}: ${error.message}`,
          );
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
    pushToWoo = true,
  ): Promise<IProduct> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!product) {
      throw new ResourceNotFoundException('Product', id);
    }

    await this.verifyStoreAccess(product.storeId.toString(), userId);

    if (imageIndex < 0 || imageIndex >= product.images.length) {
      throw new InvalidInputException(
        'imageIndex',
        `must be between 0 and ${product.images.length - 1}`,
        `Valid index range: 0-${product.images.length - 1}`,
      );
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
    this.deleteRemovedImages(product.storeId.toString(), [deletedImage]).catch(
      (error) => {
        this.logger.warn(`Failed to delete image: ${error.message}`);
      },
    );

    return this.toProductInterface(product);
  }

  private async syncImagesToWoo(product: ProductDocument): Promise<void> {
    const store = await this.storeModel
      .findById(product.storeId)
      .select('+credentials');

    if (!store) {
      throw new ResourceNotFoundException('Store', product.storeId.toString());
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    // Fetch current product from WooCommerce to get existing image IDs
    // This ensures we don't re-upload images that already exist in WordPress
    const wooImageMap = new Map<string, number>();
    try {
      const currentWooProduct = await this.wooCommerceService.getProduct(
        credentials,
        product.externalId,
      );
      if (currentWooProduct?.images) {
        currentWooProduct.images.forEach((img: any) => {
          if (img.id && img.src) {
            wooImageMap.set(img.src, img.id);
          }
        });
      }
    } catch (error) {
      // If we can't fetch the product, continue without the map
      console.warn(
        'Could not fetch current WooCommerce product for image ID mapping:',
        error.message,
      );
    }

    const updatedProduct = await this.wooCommerceService.updateProduct(
      credentials,
      product.externalId,
      {
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
      },
    );

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
      throw new ResourceNotFoundException('Store', storeId);
    }

    await this.verifyStoreAccess(storeId, userId);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    const lines = csvContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);
    if (lines.length < 2) {
      throw new ValidationException(
        'csvContent',
        'file is empty or has no data rows',
        {
          lineCount: lines.length,
          expected: 'at least 2 lines (header + data)',
        },
      );
    }

    const headers = this.parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().trim(),
    );
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
        const manageStock = ['yes', 'true', '1'].includes(
          getColumn(row, 'manage stock').toLowerCase(),
        );
        const stockQuantity =
          parseInt(getColumn(row, 'stock quantity'), 10) || 0;
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
          wooProduct = await this.wooCommerceService.createProduct(
            credentials,
            productData,
          );
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

  private async upsertProductFromWoo(
    wooProduct: WooProduct,
    store: StoreDocument,
  ): Promise<void> {
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
      categories:
        wooProduct.categories?.map((cat) => ({
          externalId: cat.id,
          name: cat.name,
          slug: cat.slug,
        })) || [],
      tags:
        wooProduct.tags?.map((tag) => ({
          externalId: tag.id,
          name: tag.name,
          slug: tag.slug,
        })) || [],
      images:
        wooProduct.images?.map((img, idx) => ({
          externalId: img.id,
          src: img.src,
          name: img.name,
          alt: img.alt,
          position: idx,
        })) || [],
      attributes:
        wooProduct.attributes?.map((attr) => ({
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
      dateCreatedWoo: wooProduct.date_created
        ? new Date(wooProduct.date_created)
        : undefined,
      dateModifiedWoo: wooProduct.date_modified
        ? new Date(wooProduct.date_modified)
        : undefined,
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

  /**
   * Generate variations for a variable product from attribute combinations
   */
  async generateVariations(
    productId: string,
    userId: string,
    options: {
      regularPrice?: string;
      sku?: string;
    } = {},
  ): Promise<{
    created: number;
    skipped: number;
    variations: any[];
    message?: string;
    attributeBreakdown?: {
      attributes: { name: string; optionCount: number; options: string[] }[];
      filteredOrphanAttributes: string[];
      formula: string;
      totalCombinations: number;
    };
  }> {
    // Get the product
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(productId),
      isDeleted: false,
    });

    if (!product) {
      throw new ResourceNotFoundException('Product', productId);
    }

    // Verify user access
    await this.verifyStoreAccess(product.storeId.toString(), userId);

    // Check if product is variable type
    if (product.type !== 'variable') {
      throw new ValidationException(
        'product.type',
        'only variable products can have variations',
        { currentType: product.type, expected: 'variable' },
      );
    }

    // Get store attributes to filter out orphan attributes
    const storeAttributes = await this.attributeModel.find({
      storeId: product.storeId,
      isDeleted: false,
    });
    const storeAttributeNames = new Set(
      storeAttributes.map((attr) => attr.name.toLowerCase()),
    );

    // Get attributes that are used for variations (filter out orphan attributes)
    const allVariationAttributes = product.attributes.filter(
      (attr) => attr.variation && attr.options?.length > 0,
    );

    // Filter to only include attributes that exist in store attributes
    const variationAttributes = allVariationAttributes.filter((attr) =>
      storeAttributeNames.has(attr.name.toLowerCase()),
    );

    // Log orphan attributes if any were filtered
    const orphanAttributes = allVariationAttributes.filter(
      (attr) => !storeAttributeNames.has(attr.name.toLowerCase()),
    );
    if (orphanAttributes.length > 0) {
      this.logger.warn(
        `Filtered out ${
          orphanAttributes.length
        } orphan attributes not found in store: ${orphanAttributes
          .map((a) => a.name)
          .join(', ')}`,
      );
    }

    if (variationAttributes.length === 0) {
      throw new ValidationException(
        'product.attributes',
        'no attributes configured for variations',
        { attributeCount: product.attributes.length },
      );
    }

    // Log attribute breakdown for debugging
    const attributeBreakdown = variationAttributes.map((attr) => ({
      name: attr.name,
      optionCount: attr.options.length,
      options: attr.options,
    }));
    const totalCombinations = variationAttributes.reduce(
      (total, attr) => total * attr.options.length,
      1,
    );
    this.logger.log(
      `Generating variations for product ${productId}: ${JSON.stringify({
        productName: product.name,
        attributeCount: variationAttributes.length,
        attributes: attributeBreakdown,
        expectedCombinations: totalCombinations,
        formula: variationAttributes
          .map((attr) => `${attr.name}(${attr.options.length})`)
          .join(' × '),
      })}`,
    );

    // Generate all combinations (cartesian product)
    const generateCombinations = (arrays: string[][]): string[][] => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCombinations = generateCombinations(rest);
      return first.flatMap((item) =>
        restCombinations.map((combo) => [item, ...combo]),
      );
    };

    const optionArrays = variationAttributes.map((attr) => attr.options);
    const allCombinations = generateCombinations(optionArrays);

    // Get existing variations for this product
    const existingVariations = await this.variantModel.find({
      productId: product._id,
      isDeleted: false,
    });

    // Filter to only variants that have populated attributes for reliable dedup
    const variantsWithAttrs = existingVariations.filter(
      (v) => v.attributes && v.attributes.length > 0,
    );
    const variantsWithoutAttrs =
      existingVariations.length - variantsWithAttrs.length;

    if (variantsWithoutAttrs > 0) {
      this.logger.warn(
        `${variantsWithoutAttrs} existing variations have empty attributes and cannot be deduped. ` +
          `Consider running backfillVariantAttributes for store ${product.storeId}.`,
      );
    }

    // Create a set of existing attribute combinations for fast lookup
    // Key format: "attrName1:option1|attrName2:option2" (sorted by attribute name)
    const existingCombinationKeys = new Set(
      variantsWithAttrs.map((variant) => {
        const sortedAttrs = [...variant.attributes]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((a) => `${a.name.toLowerCase()}:${a.option.toLowerCase()}`)
          .join('|');
        return sortedAttrs;
      }),
    );

    // Filter out combinations that already exist
    const combinations = allCombinations.filter((combo) => {
      const comboKey = variationAttributes
        .map(
          (attr, i) => `${attr.name.toLowerCase()}:${combo[i].toLowerCase()}`,
        )
        .sort()
        .join('|');
      return !existingCombinationKeys.has(comboKey);
    });

    // If all combinations already exist, return early
    if (combinations.length === 0) {
      return {
        created: 0,
        skipped: allCombinations.length,
        variations: [],
        message: 'All variation combinations already exist',
        attributeBreakdown: {
          attributes: attributeBreakdown,
          filteredOrphanAttributes: orphanAttributes.map((a) => a.name),
          formula: variationAttributes
            .map((attr) => `${attr.name}(${attr.options.length})`)
            .join(' × '),
          totalCombinations,
        },
      };
    }

    // Get store credentials
    const store = await this.storeModel
      .findById(product.storeId)
      .select('+credentials');
    if (!store) {
      throw new ResourceNotFoundException('Store', product.storeId.toString());
    }

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    // Build lookup for WooCommerce attribute IDs (reuse storeAttributes from above)
    const attrNameToWooId = new Map(
      storeAttributes.map((attr) => [attr.name.toLowerCase(), attr.wooId]),
    );

    // Create variations in WooCommerce
    const variationsToCreate = combinations.map((combo, index) => ({
      regular_price: options.regularPrice || '',
      sku: options.sku ? `${options.sku}-${existingVariations.length + index + 1}` : '',
      stock_status: 'instock',
      manage_stock: false,
      attributes: variationAttributes.map((attr, i) => {
        const wooId =
          attr.externalId || attrNameToWooId.get(attr.name.toLowerCase()) || 0;
        return {
          ...(wooId ? { id: wooId } : {}),
          name: attr.name,
          option: combo[i],
        };
      }),
    }));

    try {
      // Use batch create for efficiency
      const result = await this.wooCommerceService.batchCreateVariations(
        credentials,
        product.externalId,
        variationsToCreate,
      );

      // Sync the created variations to local database
      const createdVariations = result.create || [];

      for (let i = 0; i < createdVariations.length; i++) {
        const wooVariation = createdVariations[i];
        // Use WooCommerce response attributes, but fall back to our request payload
        // when WooCommerce returns empty/incomplete attributes in batch responses
        const wooAttrs =
          wooVariation.attributes?.filter((a) => a.name && a.option) || [];
        const requestAttrs = variationsToCreate[i]?.attributes || [];
        const finalAttrs = wooAttrs.length > 0 ? wooAttrs : requestAttrs;

        await this.variantModel.findOneAndUpdate(
          { storeId: product.storeId, externalId: wooVariation.id },
          {
            storeId: product.storeId,
            productId: product._id,
            parentExternalId: product.externalId,
            externalId: wooVariation.id,
            sku: wooVariation.sku || '',
            price: wooVariation.price || '',
            regularPrice: wooVariation.regular_price || '',
            salePrice: wooVariation.sale_price || '',
            stockQuantity: wooVariation.stock_quantity,
            stockStatus: wooVariation.stock_status || 'instock',
            manageStock: wooVariation.manage_stock || false,
            attributes: finalAttrs.map((a) => ({
              name: a.name,
              option: a.option,
            })),
            image: wooVariation.image
              ? {
                  externalId: wooVariation.image.id,
                  src: wooVariation.image.src,
                  name: wooVariation.image.name || '',
                  alt: wooVariation.image.alt || '',
                }
              : undefined,
            lastSyncedAt: new Date(),
            isDeleted: false,
          },
          { upsert: true, new: true },
        );
      }

      // Update product's variation count
      product.variationIds = [
        ...(product.variationIds || []),
        ...createdVariations.map((v) => v.id),
      ];
      product.variationCount = product.variationIds.length;
      await product.save();

      const skippedCount = allCombinations.length - combinations.length;
      return {
        created: createdVariations.length,
        skipped: skippedCount,
        variations: createdVariations,
        attributeBreakdown: {
          attributes: attributeBreakdown,
          filteredOrphanAttributes: orphanAttributes.map((a) => a.name),
          formula: variationAttributes
            .map((attr) => `${attr.name}(${attr.options.length})`)
            .join(' × '),
          totalCombinations,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate variations: ${error.message}`,
        error.stack,
      );
      throw new InvalidInputException(
        'variation generation',
        `Failed to generate variations: ${error.message}`,
        'Valid product with proper attributes configured',
      );
    }
  }
}
