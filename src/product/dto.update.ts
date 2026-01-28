import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import {
  ProductStatus,
  StockStatus,
  ProductType,
  TaxStatus,
  BackorderStatus,
  CatalogVisibility,
} from './enum';

// Image DTO for product image management
export class ProductImageDto {
  @ApiPropertyOptional({ description: 'Image ID (for existing images)' })
  id?: number;

  @ApiPropertyOptional({ description: 'Image source URL' })
  src?: string;

  @ApiPropertyOptional({ description: 'Image alt text' })
  alt?: string;

  @ApiPropertyOptional({ description: 'Image name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Image position/order' })
  position?: number;
}

// Download DTO for downloadable products
export class ProductDownloadDto {
  @ApiPropertyOptional({ description: 'Download ID' })
  id?: string;

  @ApiProperty({ description: 'Download file name' })
  name: string;

  @ApiProperty({ description: 'Download file URL' })
  file: string;
}

// Attribute DTO
export class ProductAttributeDto {
  @ApiPropertyOptional({ description: 'Attribute ID' })
  id?: number;

  @ApiProperty({ description: 'Attribute name' })
  name: string;

  @ApiPropertyOptional({ description: 'Attribute position' })
  position?: number;

  @ApiPropertyOptional({ description: 'Visible on product page' })
  visible?: boolean;

  @ApiPropertyOptional({ description: 'Used for variations' })
  variation?: boolean;

  @ApiPropertyOptional({ description: 'Attribute options/values' })
  options?: string[];
}

// Default attribute DTO for variable products
export class ProductDefaultAttributeDto {
  @ApiPropertyOptional({ description: 'Attribute ID' })
  id?: number;

  @ApiProperty({ description: 'Attribute name' })
  name: string;

  @ApiPropertyOptional({ description: 'Selected option' })
  option?: string;
}

// Meta data DTO
export class ProductMetaDataDto {
  @ApiPropertyOptional({ description: 'Meta ID (for existing meta)' })
  id?: number;

  @ApiProperty({ description: 'Meta key' })
  key: string;

  @ApiProperty({ description: 'Meta value' })
  value: string;
}

// Dimensions DTO
export class ProductDimensionsDto {
  @ApiPropertyOptional({ description: 'Product length' })
  length?: string;

  @ApiPropertyOptional({ description: 'Product width' })
  width?: string;

  @ApiPropertyOptional({ description: 'Product height' })
  height?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Product slug' })
  slug?: string;

  @ApiPropertyOptional({ description: 'Product type', enum: ProductType })
  type?: ProductType;

  @ApiPropertyOptional({ description: 'Product status', enum: ProductStatus })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Featured product' })
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Catalog visibility',
    enum: CatalogVisibility,
  })
  catalogVisibility?: CatalogVisibility;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Short description' })
  shortDescription?: string;

  @ApiPropertyOptional({ description: 'Product SKU' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'Global unique ID (GTIN, UPC, EAN, ISBN)',
  })
  globalUniqueId?: string;

  @ApiPropertyOptional({ description: 'Regular price' })
  regularPrice?: string;

  @ApiPropertyOptional({ description: 'Sale price' })
  salePrice?: string;

  @ApiPropertyOptional({
    description: 'Current price (computed from regular/sale)',
  })
  price?: string;

  @ApiPropertyOptional({ description: 'Is product on sale' })
  onSale?: boolean;

  @ApiPropertyOptional({ description: 'Sale start date' })
  dateOnSaleFrom?: string;

  @ApiPropertyOptional({ description: 'Sale start date (GMT)' })
  dateOnSaleFromGmt?: string;

  @ApiPropertyOptional({ description: 'Sale end date' })
  dateOnSaleTo?: string;

  @ApiPropertyOptional({ description: 'Sale end date (GMT)' })
  dateOnSaleToGmt?: string;

  @ApiPropertyOptional({ description: 'Virtual product' })
  virtual?: boolean;

  @ApiPropertyOptional({ description: 'Downloadable product' })
  downloadable?: boolean;

  @ApiPropertyOptional({
    description: 'Downloadable files',
    type: [ProductDownloadDto],
  })
  downloads?: ProductDownloadDto[];

  @ApiPropertyOptional({ description: 'Download limit (-1 for unlimited)' })
  downloadLimit?: number;

  @ApiPropertyOptional({
    description: 'Download expiry days (-1 for unlimited)',
  })
  downloadExpiry?: number;

  @ApiPropertyOptional({ description: 'External product URL' })
  externalUrl?: string;

  @ApiPropertyOptional({ description: 'External product button text' })
  buttonText?: string;

  @ApiPropertyOptional({ description: 'Tax status', enum: TaxStatus })
  taxStatus?: TaxStatus;

  @ApiPropertyOptional({ description: 'Tax class' })
  taxClass?: string;

  @ApiPropertyOptional({ description: 'Manage stock', example: true })
  manageStock?: boolean;

  @ApiPropertyOptional({ description: 'Stock quantity', example: 100 })
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Stock status', enum: StockStatus })
  stockStatus?: StockStatus;

  @ApiPropertyOptional({
    description: 'Backorder status',
    enum: BackorderStatus,
  })
  backorders?: BackorderStatus;

  @ApiPropertyOptional({ description: 'Low stock threshold' })
  lowStockAmount?: number;

  @ApiPropertyOptional({ description: 'Sold individually (one per order)' })
  soldIndividually?: boolean;

  @ApiPropertyOptional({ description: 'Product weight' })
  weight?: string;

  @ApiPropertyOptional({
    description: 'Product dimensions',
    type: ProductDimensionsDto,
  })
  dimensions?: ProductDimensionsDto;

  @ApiPropertyOptional({ description: 'Shipping class slug' })
  shippingClass?: string;

  @ApiPropertyOptional({ description: 'Allow reviews' })
  reviewsAllowed?: boolean;

  @ApiPropertyOptional({ description: 'Upsell product IDs' })
  upsellIds?: number[];

  @ApiPropertyOptional({ description: 'Cross-sell product IDs' })
  crossSellIds?: number[];

  @ApiPropertyOptional({ description: 'Parent product ID' })
  parentId?: number;

  @ApiPropertyOptional({ description: 'Purchase note' })
  purchaseNote?: string;

  @ApiPropertyOptional({ description: 'Category IDs' })
  categories?: number[];

  @ApiPropertyOptional({ description: 'Tag IDs' })
  tags?: number[];

  @ApiPropertyOptional({
    description: 'Product images',
    type: [ProductImageDto],
  })
  images?: ProductImageDto[];

  @ApiPropertyOptional({
    description: 'Product attributes',
    type: [ProductAttributeDto],
  })
  attributes?: ProductAttributeDto[];

  @ApiPropertyOptional({
    description: 'Default attributes for variable products',
    type: [ProductDefaultAttributeDto],
  })
  defaultAttributes?: ProductDefaultAttributeDto[];

  @ApiPropertyOptional({ description: 'Grouped product IDs' })
  groupedProducts?: number[];

  @ApiPropertyOptional({ description: 'Menu order for sorting' })
  menuOrder?: number;

  @ApiPropertyOptional({
    description: 'Product meta data',
    type: [ProductMetaDataDto],
  })
  metaData?: ProductMetaDataDto[];
}

const ProductImageJoiSchema = Joi.object()
  .keys({
    id: Joi.number().optional(),
    src: Joi.string().uri().optional(),
    alt: Joi.string().allow('').optional(),
    name: Joi.string().allow('').optional(),
    position: Joi.number().min(0).optional(),
  })
  .or('id', 'src');

const ProductDownloadJoiSchema = Joi.object().keys({
  id: Joi.string().optional(),
  name: Joi.string().required(),
  file: Joi.string().uri().required(),
});

const ProductAttributeJoiSchema = Joi.object().keys({
  id: Joi.number().optional(),
  name: Joi.string().required(),
  position: Joi.number().min(0).optional(),
  visible: Joi.boolean().optional(),
  variation: Joi.boolean().optional(),
  options: Joi.array().items(Joi.string()).optional(),
});

const ProductDefaultAttributeJoiSchema = Joi.object().keys({
  id: Joi.number().optional(),
  name: Joi.string().required(),
  option: Joi.string().optional(),
});

const ProductMetaDataJoiSchema = Joi.object().keys({
  id: Joi.number().optional(),
  key: Joi.string().required(),
  value: Joi.string().required(),
});

const ProductDimensionsJoiSchema = Joi.object().keys({
  length: Joi.string().allow('').optional(),
  width: Joi.string().allow('').optional(),
  height: Joi.string().allow('').optional(),
});

export const UpdateProductSchema = Joi.object().keys({
  name: Joi.string().min(1).max(255).optional(),
  slug: Joi.string().allow('').optional(),
  type: Joi.string()
    .valid(...Object.values(ProductType))
    .optional(),
  status: Joi.string()
    .valid(...Object.values(ProductStatus))
    .optional(),
  featured: Joi.boolean().optional(),
  catalogVisibility: Joi.string()
    .valid(...Object.values(CatalogVisibility))
    .optional(),
  description: Joi.string().allow('').optional(),
  shortDescription: Joi.string().allow('').optional(),
  sku: Joi.string().allow('').optional(),
  globalUniqueId: Joi.string().allow('').optional(),
  regularPrice: Joi.string().allow('', null).optional(),
  salePrice: Joi.string().allow('', null).optional(),
  price: Joi.string().allow('', null).optional(),
  onSale: Joi.boolean().optional(),
  dateOnSaleFrom: Joi.string().allow(null, '').optional(),
  dateOnSaleFromGmt: Joi.string().allow(null, '').optional(),
  dateOnSaleTo: Joi.string().allow(null, '').optional(),
  dateOnSaleToGmt: Joi.string().allow(null, '').optional(),
  virtual: Joi.boolean().optional(),
  downloadable: Joi.boolean().optional(),
  downloads: Joi.array().items(ProductDownloadJoiSchema).optional(),
  downloadLimit: Joi.number().min(-1).optional(),
  downloadExpiry: Joi.number().min(-1).optional(),
  externalUrl: Joi.string().uri().allow('').optional(),
  buttonText: Joi.string().allow('').optional(),
  taxStatus: Joi.string()
    .valid(...Object.values(TaxStatus))
    .optional(),
  taxClass: Joi.string().allow('').optional(),
  manageStock: Joi.boolean().optional(),
  stockQuantity: Joi.number().min(0).allow(null).optional(),
  stockStatus: Joi.string()
    .valid(...Object.values(StockStatus))
    .optional(),
  backorders: Joi.string()
    .valid(...Object.values(BackorderStatus))
    .optional(),
  lowStockAmount: Joi.number().min(0).allow(null).optional(),
  soldIndividually: Joi.boolean().optional(),
  weight: Joi.string().allow('').optional(),
  dimensions: ProductDimensionsJoiSchema.optional(),
  shippingClass: Joi.string().allow('').optional(),
  reviewsAllowed: Joi.boolean().optional(),
  upsellIds: Joi.array().items(Joi.number()).optional(),
  crossSellIds: Joi.array().items(Joi.number()).optional(),
  parentId: Joi.number().optional(),
  purchaseNote: Joi.string().allow('').optional(),
  categories: Joi.array().items(Joi.number()).optional(),
  tags: Joi.array().items(Joi.number()).optional(),
  images: Joi.array().items(ProductImageJoiSchema).optional(),
  attributes: Joi.array().items(ProductAttributeJoiSchema).optional(),
  defaultAttributes: Joi.array()
    .items(ProductDefaultAttributeJoiSchema)
    .optional(),
  groupedProducts: Joi.array().items(Joi.number()).optional(),
  menuOrder: Joi.number().optional(),
  metaData: Joi.array().items(ProductMetaDataJoiSchema).optional(),
});

export class UpdateStockDto {
  @ApiPropertyOptional({ description: 'New stock quantity', example: 50 })
  quantity: number;
}

export const UpdateStockSchema = Joi.object().keys({
  quantity: Joi.number().min(0).required(),
});

// Bulk update DTO
export class BulkUpdateProductDto {
  productIds: string[];
  status?: ProductStatus;
  stockQuantity?: number;
  stockStatus?: StockStatus;
  regularPrice?: string;
  salePrice?: string;
  manageStock?: boolean;
  lowStockAmount?: number;
  attributes?: {
    id?: number;
    name: string;
    position?: number;
    visible?: boolean;
    variation?: boolean;
    options: string[];
  }[];
  priceAdjustment?: {
    type: 'increase' | 'decrease';
    method: 'percentage' | 'fixed';
    value: number;
  };
}

export const BulkUpdateProductSchema = Joi.object().keys({
  productIds: Joi.array().items(Joi.string()).min(1).required(),
  status: Joi.string()
    .valid(...Object.values(ProductStatus))
    .optional(),
  stockQuantity: Joi.number().min(0).optional(),
  stockStatus: Joi.string()
    .valid(...Object.values(StockStatus))
    .optional(),
  regularPrice: Joi.string().allow('', null).optional(),
  salePrice: Joi.string().allow('', null).optional(),
  manageStock: Joi.boolean().optional(),
  lowStockAmount: Joi.number().min(0).allow(null).optional(),
  attributes: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().optional(),
        name: Joi.string().required(),
        position: Joi.number().optional(),
        visible: Joi.boolean().optional(),
        variation: Joi.boolean().optional(),
        options: Joi.array().items(Joi.string()).required(),
      }),
    )
    .optional(),
  priceAdjustment: Joi.object({
    type: Joi.string().valid('increase', 'decrease').required(),
    method: Joi.string().valid('percentage', 'fixed').required(),
    value: Joi.number().min(0).required(),
  }).optional(),
});

// Bulk update variant DTO
export class BulkUpdateVariantDto {
  variantIds: string[];
  stockQuantity?: number;
  stockStatus?: StockStatus;
  regularPrice?: string;
  salePrice?: string;
  manageStock?: boolean;
  status?: string;
  priceAdjustment?: {
    type: 'increase' | 'decrease';
    method: 'percentage' | 'fixed';
    value: number;
  };
}

export const BulkUpdateVariantSchema = Joi.object().keys({
  variantIds: Joi.array().items(Joi.string()).min(1).required(),
  stockQuantity: Joi.number().min(0).optional(),
  stockStatus: Joi.string()
    .valid(...Object.values(StockStatus))
    .optional(),
  regularPrice: Joi.string().allow('', null).optional(),
  salePrice: Joi.string().allow('', null).optional(),
  manageStock: Joi.boolean().optional(),
  status: Joi.string()
    .valid('publish', 'pending', 'draft', 'private')
    .optional(),
  priceAdjustment: Joi.object({
    type: Joi.string().valid('increase', 'decrease').required(),
    method: Joi.string().valid('percentage', 'fixed').required(),
    value: Joi.number().min(0).required(),
  }).optional(),
});

// Create Product DTO
export class CreateProductDto {
  @ApiProperty({ description: 'Store ID' })
  storeId: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiPropertyOptional({ description: 'Product slug' })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Product type',
    enum: ProductType,
    default: ProductType.SIMPLE,
  })
  type?: ProductType;

  @ApiPropertyOptional({
    description: 'Product status',
    enum: ProductStatus,
    default: ProductStatus.DRAFT,
  })
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Featured product' })
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Catalog visibility',
    enum: CatalogVisibility,
  })
  catalogVisibility?: CatalogVisibility;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Short description' })
  shortDescription?: string;

  @ApiPropertyOptional({ description: 'Product SKU' })
  sku?: string;

  @ApiPropertyOptional({
    description: 'Global unique ID (GTIN, UPC, EAN, ISBN)',
  })
  globalUniqueId?: string;

  @ApiPropertyOptional({ description: 'Regular price' })
  regularPrice?: string;

  @ApiPropertyOptional({ description: 'Sale price' })
  salePrice?: string;

  @ApiPropertyOptional({ description: 'Sale start date' })
  dateOnSaleFrom?: string;

  @ApiPropertyOptional({ description: 'Sale start date (GMT)' })
  dateOnSaleFromGmt?: string;

  @ApiPropertyOptional({ description: 'Sale end date' })
  dateOnSaleTo?: string;

  @ApiPropertyOptional({ description: 'Sale end date (GMT)' })
  dateOnSaleToGmt?: string;

  @ApiPropertyOptional({ description: 'Virtual product' })
  virtual?: boolean;

  @ApiPropertyOptional({ description: 'Downloadable product' })
  downloadable?: boolean;

  @ApiPropertyOptional({
    description: 'Downloadable files',
    type: [ProductDownloadDto],
  })
  downloads?: ProductDownloadDto[];

  @ApiPropertyOptional({ description: 'Download limit (-1 for unlimited)' })
  downloadLimit?: number;

  @ApiPropertyOptional({
    description: 'Download expiry days (-1 for unlimited)',
  })
  downloadExpiry?: number;

  @ApiPropertyOptional({ description: 'External product URL' })
  externalUrl?: string;

  @ApiPropertyOptional({ description: 'External product button text' })
  buttonText?: string;

  @ApiPropertyOptional({ description: 'Tax status', enum: TaxStatus })
  taxStatus?: TaxStatus;

  @ApiPropertyOptional({ description: 'Tax class' })
  taxClass?: string;

  @ApiPropertyOptional({ description: 'Manage stock', default: false })
  manageStock?: boolean;

  @ApiPropertyOptional({ description: 'Stock quantity' })
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Stock status', enum: StockStatus })
  stockStatus?: StockStatus;

  @ApiPropertyOptional({
    description: 'Backorder status',
    enum: BackorderStatus,
  })
  backorders?: BackorderStatus;

  @ApiPropertyOptional({ description: 'Low stock threshold' })
  lowStockAmount?: number;

  @ApiPropertyOptional({ description: 'Sold individually (one per order)' })
  soldIndividually?: boolean;

  @ApiPropertyOptional({ description: 'Product weight' })
  weight?: string;

  @ApiPropertyOptional({
    description: 'Product dimensions',
    type: ProductDimensionsDto,
  })
  dimensions?: ProductDimensionsDto;

  @ApiPropertyOptional({ description: 'Shipping class slug' })
  shippingClass?: string;

  @ApiPropertyOptional({ description: 'Allow reviews' })
  reviewsAllowed?: boolean;

  @ApiPropertyOptional({ description: 'Upsell product IDs' })
  upsellIds?: number[];

  @ApiPropertyOptional({ description: 'Cross-sell product IDs' })
  crossSellIds?: number[];

  @ApiPropertyOptional({ description: 'Parent product ID' })
  parentId?: number;

  @ApiPropertyOptional({ description: 'Purchase note' })
  purchaseNote?: string;

  @ApiPropertyOptional({ description: 'Category IDs' })
  categories?: number[];

  @ApiPropertyOptional({ description: 'Tag IDs' })
  tags?: number[];

  @ApiPropertyOptional({
    description: 'Product images',
    type: [ProductImageDto],
  })
  images?: ProductImageDto[];

  @ApiPropertyOptional({
    description: 'Product attributes',
    type: [ProductAttributeDto],
  })
  attributes?: ProductAttributeDto[];

  @ApiPropertyOptional({
    description: 'Default attributes for variable products',
    type: [ProductDefaultAttributeDto],
  })
  defaultAttributes?: ProductDefaultAttributeDto[];

  @ApiPropertyOptional({ description: 'Grouped product IDs' })
  groupedProducts?: number[];

  @ApiPropertyOptional({ description: 'Menu order for sorting' })
  menuOrder?: number;

  @ApiPropertyOptional({
    description: 'Product meta data',
    type: [ProductMetaDataDto],
  })
  metaData?: ProductMetaDataDto[];
}

export const CreateProductSchema = Joi.object().keys({
  storeId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  name: Joi.string().min(1).max(255).required(),
  slug: Joi.string().optional(),
  type: Joi.string()
    .valid(...Object.values(ProductType))
    .default('simple')
    .optional(),
  status: Joi.string()
    .valid(...Object.values(ProductStatus))
    .default('draft')
    .optional(),
  featured: Joi.boolean().optional(),
  catalogVisibility: Joi.string()
    .valid(...Object.values(CatalogVisibility))
    .optional(),
  description: Joi.string().allow('').optional(),
  shortDescription: Joi.string().allow('').optional(),
  sku: Joi.string().allow('').optional(),
  globalUniqueId: Joi.string().allow('').optional(),
  regularPrice: Joi.string().allow('', null).optional(),
  salePrice: Joi.string().allow('', null).optional(),
  dateOnSaleFrom: Joi.string().allow(null, '').optional(),
  dateOnSaleFromGmt: Joi.string().allow(null, '').optional(),
  dateOnSaleTo: Joi.string().allow(null, '').optional(),
  dateOnSaleToGmt: Joi.string().allow(null, '').optional(),
  virtual: Joi.boolean().optional(),
  downloadable: Joi.boolean().optional(),
  downloads: Joi.array().items(ProductDownloadJoiSchema).optional(),
  downloadLimit: Joi.number().min(-1).optional(),
  downloadExpiry: Joi.number().min(-1).optional(),
  externalUrl: Joi.string().uri().allow('').optional(),
  buttonText: Joi.string().allow('').optional(),
  taxStatus: Joi.string()
    .valid(...Object.values(TaxStatus))
    .optional(),
  taxClass: Joi.string().allow('').optional(),
  manageStock: Joi.boolean().default(false).optional(),
  stockQuantity: Joi.number().min(0).allow(null).optional(),
  stockStatus: Joi.string()
    .valid(...Object.values(StockStatus))
    .optional(),
  backorders: Joi.string()
    .valid(...Object.values(BackorderStatus))
    .optional(),
  lowStockAmount: Joi.number().min(0).allow(null).optional(),
  soldIndividually: Joi.boolean().optional(),
  weight: Joi.string().allow('').optional(),
  dimensions: ProductDimensionsJoiSchema.optional(),
  shippingClass: Joi.string().allow('').optional(),
  reviewsAllowed: Joi.boolean().optional(),
  upsellIds: Joi.array().items(Joi.number()).optional(),
  crossSellIds: Joi.array().items(Joi.number()).optional(),
  parentId: Joi.number().optional(),
  purchaseNote: Joi.string().allow('').optional(),
  categories: Joi.array().items(Joi.number()).optional(),
  tags: Joi.array().items(Joi.number()).optional(),
  images: Joi.array().items(ProductImageJoiSchema).optional(),
  attributes: Joi.array().items(ProductAttributeJoiSchema).optional(),
  defaultAttributes: Joi.array()
    .items(ProductDefaultAttributeJoiSchema)
    .optional(),
  groupedProducts: Joi.array().items(Joi.number()).optional(),
  menuOrder: Joi.number().optional(),
  metaData: Joi.array().items(ProductMetaDataJoiSchema).optional(),
});

// Update single variant DTO
export class UpdateVariantDto {
  @ApiPropertyOptional({ description: 'Regular price' })
  regularPrice?: string;

  @ApiPropertyOptional({ description: 'Sale price' })
  salePrice?: string;

  @ApiPropertyOptional({ description: 'SKU' })
  sku?: string;

  @ApiPropertyOptional({ description: 'Manage stock' })
  manageStock?: boolean;

  @ApiPropertyOptional({ description: 'Stock quantity' })
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Stock status', enum: StockStatus })
  stockStatus?: StockStatus;

  @ApiPropertyOptional({ description: 'Status' })
  status?: string;

  @ApiPropertyOptional({ description: 'Weight' })
  weight?: string;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Variant image (null to remove)' })
  image?: { src: string; alt?: string } | null;
}

export const UpdateVariantSchema = Joi.object().keys({
  regularPrice: Joi.string().allow('', null).optional(),
  salePrice: Joi.string().allow('', null).optional(),
  sku: Joi.string().allow('').optional(),
  manageStock: Joi.boolean().optional(),
  stockQuantity: Joi.number().min(0).optional(),
  stockStatus: Joi.string()
    .valid(...Object.values(StockStatus))
    .optional(),
  status: Joi.string()
    .valid('publish', 'pending', 'draft', 'private')
    .optional(),
  weight: Joi.string().allow('').optional(),
  description: Joi.string().allow('').optional(),
  image: Joi.object({
    src: Joi.string().uri().required(),
    alt: Joi.string().allow('').optional(),
  })
    .allow(null)
    .optional(),
});
