import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';

import { ProductImport, ProductImportDocument } from './schema';
import { Store, StoreDocument } from '../store/schema';
import { Product, ProductDocument } from '../product/schema';
import { ImportStatus, ImportSource, PricingMode, MarkupType } from './enum';
import {
  IExternalProduct,
  IShopifyProduct,
  IShopifyProductsResponse,
  IImportResult,
  IFetchOptions,
  ISelectedProduct,
  IImportSettings,
  IImportProgress,
} from './interface';
import { FetchProductsDto, ExecuteImportDto } from './dto';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    @InjectModel(ProductImport.name) private importModel: Model<ProductImportDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Verify user has access to the store
   */
  private async verifyStoreAccess(
    storeId: string,
    userId: string,
    includeCredentials = false,
  ): Promise<StoreDocument> {
    let query = this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    // Include credentials if needed (they're excluded by default)
    if (includeCredentials) {
      query = query.select('+credentials');
    }

    const store = await query.exec();

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  /**
   * Fetch products from external source (Shopify)
   */
  async fetchProducts(
    dto: FetchProductsDto,
    userId: string,
  ): Promise<{ products: IExternalProduct[]; pagination: { page: number; hasMore: boolean } }> {
    // Verify store access
    await this.verifyStoreAccess(dto.storeId, userId);

    if (dto.source === ImportSource.SHOPIFY) {
      return this.fetchShopifyProducts(dto);
    }

    throw new BadRequestException(`Unsupported import source: ${dto.source}`);
  }

  /**
   * Fetch products from Shopify public API
   */
  private async fetchShopifyProducts(
    dto: FetchProductsDto,
  ): Promise<{ products: IExternalProduct[]; pagination: { page: number; hasMore: boolean } }> {
    const { sourceUrl, limit = 50, page = 1 } = dto;

    // Normalize URL - remove trailing slash
    const baseUrl = sourceUrl.replace(/\/$/, '');

    // Build Shopify products.json URL
    const url = `${baseUrl}/products.json?limit=${limit}&page=${page}`;

    this.logger.log(`Fetching products from Shopify: ${url}`);

    try {
      const response = await axios.get<IShopifyProductsResponse>(url, {
        timeout: 30000, // 30 second timeout
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CartFlow/1.0',
        },
      });

      const shopifyProducts = response.data.products || [];

      // Normalize products to common format
      const products = this.normalizeShopifyProducts(shopifyProducts, dto);

      // Determine if there are more pages
      const hasMore = shopifyProducts.length === limit;

      return {
        products,
        pagination: {
          page,
          hasMore,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Shopify products: ${error.message}`);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new BadRequestException(
            'Store not found or products.json is not accessible. Make sure the URL is correct.',
          );
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw new BadRequestException('Could not connect to the store. Please check the URL.');
        }
      }

      throw new BadRequestException(`Failed to fetch products: ${error.message}`);
    }
  }

  /**
   * Normalize Shopify products to common format
   */
  private normalizeShopifyProducts(
    shopifyProducts: IShopifyProduct[],
    options: IFetchOptions,
  ): IExternalProduct[] {
    return shopifyProducts.map((product) => {
      // Determine product type
      const isSimple =
        product.variants.length === 1 && product.variants[0].title === 'Default Title';
      const type = isSimple ? 'simple' : 'variable';

      // Calculate price range
      const prices = product.variants.map((v) => parseFloat(v.price) || 0);
      const priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices),
      };

      // Map images
      const images = options.includeImages
        ? product.images.map((img) => ({
            src: img.src,
            alt: img.alt || product.title,
            position: img.position,
          }))
        : [];

      // Map variants
      const variants = options.includeVariants
        ? product.variants.map((v) => {
            // Extract options from variant
            const variantOptions: { name: string; value: string }[] = [];
            if (v.option1 && product.options[0]) {
              variantOptions.push({ name: product.options[0].name, value: v.option1 });
            }
            if (v.option2 && product.options[1]) {
              variantOptions.push({ name: product.options[1].name, value: v.option2 });
            }
            if (v.option3 && product.options[2]) {
              variantOptions.push({ name: product.options[2].name, value: v.option3 });
            }

            return {
              externalId: String(v.id),
              title: v.title,
              sku: v.sku || '',
              price: v.price,
              compareAtPrice: v.compare_at_price,
              options: variantOptions,
              available: v.available,
              weight: v.grams,
              weightUnit: 'g',
            };
          })
        : [];

      // Map options (attributes)
      const productOptions = product.options
        .filter((opt) => !(opt.name === 'Title' && opt.values.length === 1 && opt.values[0] === 'Default Title'))
        .map((opt) => ({
          name: opt.name,
          position: opt.position,
          values: opt.values,
        }));

      return {
        externalId: String(product.id),
        title: product.title,
        handle: product.handle,
        description: options.includeDescription ? product.body_html || '' : '',
        vendor: product.vendor || '',
        productType: product.product_type || '',
        tags: product.tags || [],
        images,
        variants,
        options: productOptions,
        type,
        priceRange,
      };
    });
  }

  /**
   * Execute product import
   */
  async executeImport(dto: ExecuteImportDto, userId: string): Promise<{ jobId: string }> {
    // Verify store access and get credentials for WooCommerce API
    const store = await this.verifyStoreAccess(dto.storeId, userId, true);

    // Create import job
    const importJob = new this.importModel({
      storeId: new Types.ObjectId(dto.storeId),
      userId: new Types.ObjectId(userId),
      source: dto.source,
      sourceUrl: dto.sourceUrl,
      status: ImportStatus.PENDING,
      totalProducts: dto.products.length,
      completedProducts: 0,
      failedProducts: 0,
      skippedProducts: 0,
      settings: dto.settings,
      selectedProducts: dto.products,
      results: [],
    });

    await importJob.save();

    // Start background import process
    this.processImport(importJob._id.toString(), store, dto.products, dto.settings);

    return { jobId: importJob._id.toString() };
  }

  /**
   * Process import in background
   */
  private async processImport(
    jobId: string,
    store: StoreDocument,
    products: ISelectedProduct[],
    settings: IImportSettings,
  ): Promise<void> {
    this.logger.log(`Starting import job ${jobId} with ${products.length} products`);

    try {
      // Update job status to running
      await this.importModel.findByIdAndUpdate(jobId, {
        status: ImportStatus.RUNNING,
        startedAt: new Date(),
      });

      const results: IImportResult[] = [];

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const startTime = Date.now();

        // Update current product
        await this.importModel.findByIdAndUpdate(jobId, {
          currentProduct: product.title,
        });

        try {
          const result = await this.importSingleProduct(store, product, settings);
          results.push({
            ...result,
            duration: Date.now() - startTime,
          });

          // Update progress
          const update: any = {
            $push: { results: result },
          };

          if (result.status === 'success') {
            update.$inc = { completedProducts: 1 };
          } else if (result.status === 'failed') {
            update.$inc = { failedProducts: 1 };
          } else {
            update.$inc = { skippedProducts: 1 };
          }

          await this.importModel.findByIdAndUpdate(jobId, update);
        } catch (error) {
          this.logger.error(`Failed to import product ${product.title}: ${error.message}`);

          const failedResult: IImportResult = {
            externalId: product.externalId,
            title: product.title,
            status: 'failed',
            error: error.message,
            duration: Date.now() - startTime,
          };

          results.push(failedResult);

          await this.importModel.findByIdAndUpdate(jobId, {
            $push: { results: failedResult },
            $inc: { failedProducts: 1 },
          });
        }
      }

      // Mark job as completed
      await this.importModel.findByIdAndUpdate(jobId, {
        status: ImportStatus.COMPLETED,
        completedAt: new Date(),
        currentProduct: null,
      });

      this.logger.log(`Import job ${jobId} completed`);
    } catch (error) {
      this.logger.error(`Import job ${jobId} failed: ${error.message}`);

      await this.importModel.findByIdAndUpdate(jobId, {
        status: ImportStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error.message,
      });
    }
  }

  /**
   * Import a single product
   */
  private async importSingleProduct(
    store: StoreDocument,
    product: ISelectedProduct,
    settings: IImportSettings,
  ): Promise<IImportResult> {
    this.logger.log(`[Import] Starting product: ${product.title} (${product.images?.length || 0} images)`);

    // Prepare WooCommerce product data
    const wooProduct = this.prepareWooCommerceProduct(product, settings);

    // Get store credentials
    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    // Create product in WooCommerce (images can take a long time to download)
    this.logger.log(`[Import] Creating product in WooCommerce: ${product.title}`);
    const startTime = Date.now();
    const createdProduct = await this.wooCommerceService.createProduct(credentials, wooProduct);
    this.logger.log(`[Import] Product created in WooCommerce in ${Date.now() - startTime}ms: ${product.title} (ID: ${createdProduct.id})`);

    // Save to local database
    const localProduct = new this.productModel({
      storeId: store._id,
      externalId: createdProduct.id,
      name: product.title,
      slug: createdProduct.slug,
      type: product.type,
      status: settings.status,
      featured: false,
      catalogVisibility: settings.catalogVisibility || 'visible',
      description: product.description || '',
      shortDescription: '',
      sku: product.variants[0]?.sku || '',
      price: this.calculatePrice(product.variants[0]?.price, settings),
      regularPrice: this.calculatePrice(product.variants[0]?.price, settings),
      salePrice: product.variants[0]?.compareAtPrice
        ? this.calculatePrice(product.variants[0].price, settings)
        : null,
      onSale: !!product.variants[0]?.compareAtPrice,
      stockStatus: settings.stockStatus,
      manageStock: settings.manageStock,
      stockQuantity: settings.manageStock ? settings.stockQuantity || 0 : null,
      categories: settings.categories?.map((catId) => ({ externalId: catId })) || [],
      tags: settings.tags?.map((tag) => ({ name: tag })) || [],
      images:
        product.images?.map((img, idx) => ({
          src: img.src,
          alt: img.alt || product.title,
          position: idx,
        })) || [],
      attributes:
        product.type === 'variable'
          ? product.options?.map((opt) => ({
              name: opt.name,
              position: opt.position,
              visible: true,
              variation: true,
              options: opt.values,
            }))
          : [],
      importSource: {
        platform: 'shopify',
        externalId: product.externalId,
        url: store.url,
      },
    });

    await localProduct.save();

    // Generate variations if variable product and autoGenerateVariations is enabled
    let variationsGenerated = 0;
    if (product.type === 'variable' && settings.autoGenerateVariations && product.options?.length > 0) {
      try {
        variationsGenerated = await this.generateVariations(
          store,
          createdProduct.id,
          localProduct._id.toString(),
          product,
          settings,
        );
      } catch (error) {
        this.logger.warn(`Failed to generate variations for ${product.title}: ${error.message}`);
      }
    }

    return {
      externalId: product.externalId,
      title: product.title,
      status: 'success',
      productId: localProduct._id.toString(),
      wooProductId: createdProduct.id,
      variationsGenerated,
    };
  }

  /**
   * Prepare product data for WooCommerce API
   */
  private prepareWooCommerceProduct(product: ISelectedProduct, settings: IImportSettings): any {
    const basePrice = product.variants[0]?.price || '0';
    const calculatedPrice = this.calculatePrice(basePrice, settings);
    const compareAtPrice = product.variants[0]?.compareAtPrice;

    const wooProduct: any = {
      name: product.title,
      type: product.type,
      status: settings.status,
      catalog_visibility: settings.catalogVisibility || 'visible',
      description: product.description || '',
      short_description: '',
      sku: product.variants[0]?.sku || '',
      regular_price: calculatedPrice,
      stock_status: settings.stockStatus,
      manage_stock: settings.manageStock,
      categories: settings.categories?.map((catId) => ({ id: parseInt(catId, 10) })) || [],
      tags: settings.tags?.map((tag) => ({ name: tag })) || [],
    };

    // Handle images with optional limit (images slow down import significantly)
    if (settings.maxImages !== 0) {
      let productImages = product.images || [];
      if (settings.maxImages !== undefined && settings.maxImages > 0) {
        productImages = productImages.slice(0, settings.maxImages);
      }
      wooProduct.images = productImages.map((img) => ({
        src: img.src,
        alt: img.alt || product.title,
      }));
    } else {
      wooProduct.images = []; // maxImages = 0 means no images
    }

    // Add sale price if compare_at_price exists
    if (compareAtPrice && parseFloat(compareAtPrice) > parseFloat(basePrice)) {
      wooProduct.regular_price = this.calculatePrice(compareAtPrice, settings);
      wooProduct.sale_price = calculatedPrice;
    }

    // Add stock quantity if managing stock
    if (settings.manageStock && settings.stockQuantity !== undefined) {
      wooProduct.stock_quantity = settings.stockQuantity;
    }

    // Add attributes for variable products
    if (product.type === 'variable') {
      // Use selected attributes from settings if provided, otherwise use product options
      if (settings.attributes && settings.attributes.length > 0) {
        wooProduct.attributes = settings.attributes.map((attr, idx) => ({
          name: attr.name,
          position: idx,
          visible: attr.visible ?? true,
          variation: attr.variation ?? true,
          options: attr.options || [],
        }));
      } else if (product.options?.length > 0) {
        // Fallback to product options from source
        wooProduct.attributes = product.options.map((opt) => ({
          name: opt.name,
          position: opt.position,
          visible: true,
          variation: true,
          options: opt.values,
        }));
      }
    }

    return wooProduct;
  }

  /**
   * Calculate price based on settings (for simple products)
   */
  private calculatePrice(originalPrice: string, settings: IImportSettings): string {
    const price = parseFloat(originalPrice) || 0;

    switch (settings.pricing.mode) {
      case PricingMode.KEEP:
        return price.toFixed(2);

      case PricingMode.MARKUP:
        if (settings.pricing.markupType === MarkupType.PERCENTAGE) {
          const markup = settings.pricing.markupValue || 0;
          return (price * (1 + markup / 100)).toFixed(2);
        } else {
          const fixedMarkup = settings.pricing.markupValue || 0;
          return (price + fixedMarkup).toFixed(2);
        }

      case PricingMode.FIXED:
        return (settings.pricing.fixedPrice || 0).toFixed(2);

      default:
        return price.toFixed(2);
    }
  }

  /**
   * Calculate variation price based on settings
   * For variations, we use the variation-specific markup settings if mode is 'markup'
   */
  private calculateVariationPrice(originalPrice: string, settings: IImportSettings): string {
    const price = parseFloat(originalPrice) || 0;

    // If variationPriceMode is 'original', keep the original price as-is
    if (settings.variationPriceMode === 'original' || !settings.variationPriceMode) {
      return price.toFixed(2);
    }

    // If variationPriceMode is 'markup', apply the variation-specific markup
    if (settings.variationPriceMode === 'markup') {
      const markupType = settings.variationMarkupType || 'percentage';
      const markupValue = settings.variationMarkupValue || 0;

      if (markupType === 'percentage') {
        return (price * (1 + markupValue / 100)).toFixed(2);
      } else {
        return (price + markupValue).toFixed(2);
      }
    }

    return price.toFixed(2);
  }

  /**
   * Generate variations for variable product
   */
  private async generateVariations(
    store: StoreDocument,
    wooProductId: number,
    localProductId: string,
    product: ISelectedProduct,
    settings: IImportSettings,
  ): Promise<number> {
    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    // Use settings.attributes if provided, otherwise use product.options
    const attributesToUse = settings.attributes && settings.attributes.length > 0
      ? settings.attributes.map((attr, idx) => ({
          name: attr.name,
          position: idx,
          values: attr.options || [],
        }))
      : product.options || [];

    // Generate all combinations of options
    const combinations = this.generateAttributeCombinations(attributesToUse);

    this.logger.debug(`Generating ${combinations.length} variations for product ${product.title}`);

    let created = 0;

    for (const combination of combinations) {
      try {
        // Find matching variant from source (if any) to get price/sku
        const matchingVariant = product.variants.find((v) =>
          v.options.every(
            (opt) =>
              combination.find((c) => c.name === opt.name)?.value === opt.value,
          ),
        );

        const variantPrice = matchingVariant?.price || product.variants[0]?.price || '0';
        const calculatedPrice = this.calculateVariationPrice(variantPrice, settings);

        // Map attributes for variation
        const mappedAttributes = combination.map((attr) => ({
          name: attr.name,
          option: attr.value,
        }));

        const variationData = {
          regular_price: calculatedPrice,
          sku: matchingVariant?.sku || '',
          stock_status: settings.stockStatus,
          manage_stock: settings.manageStock,
          stock_quantity: settings.manageStock ? settings.stockQuantity || 0 : undefined,
          attributes: mappedAttributes,
        };

        // Handle sale price
        if (matchingVariant?.compareAtPrice) {
          const comparePrice = parseFloat(matchingVariant.compareAtPrice);
          const regularPrice = parseFloat(variantPrice);
          if (comparePrice > regularPrice) {
            variationData.regular_price = this.calculateVariationPrice(matchingVariant.compareAtPrice, settings);
            (variationData as any).sale_price = calculatedPrice;
          }
        }

        await this.wooCommerceService.createVariation(
          credentials,
          wooProductId,
          variationData,
        );

        created++;
      } catch (error) {
        this.logger.warn(`Failed to create variation: ${error.message}`);
      }
    }

    return created;
  }

  /**
   * Generate all combinations of attribute options
   */
  private generateAttributeCombinations(
    options: { name: string; values: string[] }[],
  ): { name: string; value: string }[][] {
    if (!options || options.length === 0) {
      return [];
    }

    const result: { name: string; value: string }[][] = [];

    const generate = (index: number, current: { name: string; value: string }[]) => {
      if (index === options.length) {
        result.push([...current]);
        return;
      }

      const option = options[index];
      for (const value of option.values) {
        current.push({ name: option.name, value });
        generate(index + 1, current);
        current.pop();
      }
    };

    generate(0, []);
    return result;
  }

  /**
   * Get import job status
   */
  async getImportStatus(
    jobId: string,
    userId: string,
  ): Promise<{
    jobId: string;
    status: ImportStatus;
    progress: IImportProgress;
    results: IImportResult[];
    errorMessage?: string;
  }> {
    const job = await this.importModel.findById(jobId);

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    // Verify user has access to the job
    if (job.userId.toString() !== userId) {
      // Check if user has access to the store
      await this.verifyStoreAccess(job.storeId.toString(), userId);
    }

    const total = job.totalProducts;
    const completed = job.completedProducts + job.failedProducts + job.skippedProducts;

    return {
      jobId: job._id.toString(),
      status: job.status as ImportStatus,
      progress: {
        total,
        completed: job.completedProducts,
        failed: job.failedProducts,
        skipped: job.skippedProducts,
        current: job.currentProduct,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
      results: job.results || [],
      errorMessage: job.errorMessage,
    };
  }

  /**
   * Get import history for a store
   */
  async getImportHistory(
    storeId: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    imports: ProductImportDocument[];
    total: number;
    page: number;
    pages: number;
  }> {
    await this.verifyStoreAccess(storeId, userId);

    const skip = (page - 1) * limit;

    const [imports, total] = await Promise.all([
      this.importModel
        .find({ storeId: new Types.ObjectId(storeId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.importModel.countDocuments({ storeId: new Types.ObjectId(storeId) }),
    ]);

    return {
      imports,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get WooCommerce attributes for a store
   */
  async getStoreAttributes(
    storeId: string,
    userId: string,
  ): Promise<{ attributes: any[] }> {
    const store = await this.verifyStoreAccess(storeId, userId, true);

    const credentials = {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };

    try {
      const attributes = await this.wooCommerceService.getAttributes(credentials);
      return { attributes };
    } catch (error) {
      this.logger.error(`Failed to get store attributes: ${error.message}`);
      return { attributes: [] };
    }
  }

  /**
   * Cancel a running import job
   */
  async cancelImport(jobId: string, userId: string): Promise<{ success: boolean }> {
    const job = await this.importModel.findById(jobId);

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    if (job.userId.toString() !== userId) {
      await this.verifyStoreAccess(job.storeId.toString(), userId);
    }

    if (job.status !== ImportStatus.RUNNING && job.status !== ImportStatus.PENDING) {
      throw new BadRequestException('Can only cancel pending or running imports');
    }

    await this.importModel.findByIdAndUpdate(jobId, {
      status: ImportStatus.CANCELLED,
      completedAt: new Date(),
    });

    return { success: true };
  }
}
