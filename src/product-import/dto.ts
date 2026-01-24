import * as Joi from 'joi';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportSource, PricingMode, MarkupType } from './enum';
import { IExternalImage, IExternalVariant, IExternalOption } from './interface';

// ============ Fetch Products DTO ============

export class FetchProductsDto {
  @ApiProperty({ description: 'Target store ID to import into' })
  storeId: string;

  @ApiProperty({ enum: ImportSource, description: 'Source platform' })
  source: ImportSource;

  @ApiProperty({ description: 'Source store URL (e.g., https://example.myshopify.com)' })
  sourceUrl: string;

  @ApiPropertyOptional({ description: 'Include product descriptions', default: true })
  includeDescription?: boolean;

  @ApiPropertyOptional({ description: 'Include product images', default: true })
  includeImages?: boolean;

  @ApiPropertyOptional({ description: 'Include product variants', default: true })
  includeVariants?: boolean;

  @ApiPropertyOptional({ description: 'Products per page', default: 50 })
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  page?: number;
}

export const FetchProductsSchema = Joi.object().keys({
  storeId: Joi.string()
    .required()
    .regex(/^[a-f\d]{24}$/i)
    .messages({ 'string.pattern.base': 'Invalid store ID format' }),
  source: Joi.string()
    .valid(...Object.values(ImportSource))
    .required(),
  sourceUrl: Joi.string().uri().required().messages({
    'string.uri': 'Source URL must be a valid URL',
  }),
  includeDescription: Joi.boolean().default(true),
  includeImages: Joi.boolean().default(true),
  includeVariants: Joi.boolean().default(true),
  limit: Joi.number().integer().min(1).max(250).default(50),
  page: Joi.number().integer().min(1).default(1),
});

// ============ Selected Product DTO ============

export class SelectedProductDto {
  @ApiProperty({ description: 'External product ID from source' })
  externalId: string;

  @ApiProperty({ description: 'Product title' })
  title: string;

  @ApiProperty({ enum: ['simple', 'variable'], description: 'Product type' })
  type: 'simple' | 'variable';

  @ApiProperty({ description: 'Product images', type: 'array' })
  images: IExternalImage[];

  @ApiProperty({ description: 'Product variants', type: 'array' })
  variants: IExternalVariant[];

  @ApiProperty({ description: 'Product options/attributes', type: 'array' })
  options: IExternalOption[];

  @ApiPropertyOptional({ description: 'Product description HTML' })
  description?: string;

  @ApiPropertyOptional({ description: 'Product tags', type: [String] })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Product vendor' })
  vendor?: string;
}

// ============ Import Settings DTO ============

export class ImportSettingsDto {
  @ApiProperty({ description: 'Pricing configuration' })
  pricing: {
    mode: PricingMode;
    markupType?: MarkupType;
    markupValue?: number;
    fixedPrice?: number;
  };

  @ApiPropertyOptional({ description: 'Category IDs to assign', type: [String] })
  categories?: string[];

  @ApiPropertyOptional({ description: 'Tags to assign', type: [String] })
  tags?: string[];

  @ApiProperty({ enum: ['publish', 'draft', 'private'], description: 'Product status' })
  status: 'publish' | 'draft' | 'private';

  @ApiPropertyOptional({
    enum: ['visible', 'catalog', 'search', 'hidden'],
    description: 'Catalog visibility',
  })
  catalogVisibility?: 'visible' | 'catalog' | 'search' | 'hidden';

  @ApiPropertyOptional({ enum: ['instock', 'outofstock', 'onbackorder'], description: 'Stock status' })
  stockStatus?: 'instock' | 'outofstock' | 'onbackorder';

  @ApiPropertyOptional({ description: 'Enable stock management' })
  manageStock?: boolean;

  @ApiPropertyOptional({ description: 'Stock quantity' })
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Auto-generate variations for variable products', default: true })
  autoGenerateVariations?: boolean;

  @ApiPropertyOptional({ enum: ['original', 'markup'], description: 'Variation price mode' })
  variationPriceMode?: 'original' | 'markup';

  @ApiPropertyOptional({ enum: ['percentage', 'fixed'], description: 'Variation markup type' })
  variationMarkupType?: 'percentage' | 'fixed';

  @ApiPropertyOptional({ description: 'Variation markup value' })
  variationMarkupValue?: number;

  @ApiPropertyOptional({ description: 'Max images per product (0 = no images, undefined = all)' })
  maxImages?: number;
}

// ============ Execute Import DTO ============

export class ExecuteImportDto {
  @ApiProperty({ description: 'Target store ID' })
  storeId: string;

  @ApiProperty({ enum: ImportSource, description: 'Source platform' })
  source: ImportSource;

  @ApiProperty({ description: 'Source store URL' })
  sourceUrl: string;

  @ApiProperty({ description: 'Products to import', type: [SelectedProductDto] })
  products: SelectedProductDto[];

  @ApiProperty({ description: 'Import settings', type: ImportSettingsDto })
  settings: ImportSettingsDto;
}

const ImageSchema = Joi.object().keys({
  src: Joi.string().uri().required(),
  alt: Joi.string().allow('').optional(),
  position: Joi.number().integer().min(0).required(),
});

const VariantOptionSchema = Joi.object().keys({
  name: Joi.string().required(),
  value: Joi.string().required(),
});

const VariantSchema = Joi.object().keys({
  externalId: Joi.string().required(),
  title: Joi.string().required(),
  sku: Joi.string().allow('').optional(),
  price: Joi.string().required(),
  compareAtPrice: Joi.string().allow(null).optional(),
  options: Joi.array().items(VariantOptionSchema).optional(),
  available: Joi.boolean().optional(),
  weight: Joi.number().optional(),
  weightUnit: Joi.string().optional(),
});

const OptionSchema = Joi.object().keys({
  name: Joi.string().required(),
  position: Joi.number().integer().min(0).required(),
  values: Joi.array().items(Joi.string()).required(),
});

const SelectedProductSchema = Joi.object().keys({
  externalId: Joi.string().required(),
  title: Joi.string().required(),
  type: Joi.string().valid('simple', 'variable').required(),
  images: Joi.array().items(ImageSchema).default([]),
  variants: Joi.array().items(VariantSchema).default([]),
  options: Joi.array().items(OptionSchema).default([]),
  description: Joi.string().allow('').optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  vendor: Joi.string().allow('').optional(),
});

const ImportSettingsSchema = Joi.object().keys({
  pricing: Joi.object()
    .keys({
      mode: Joi.string()
        .valid(...Object.values(PricingMode))
        .required(),
      markupType: Joi.string()
        .valid(...Object.values(MarkupType))
        .when('mode', {
          is: PricingMode.MARKUP,
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
      markupValue: Joi.number().when('mode', {
        is: PricingMode.MARKUP,
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
      fixedPrice: Joi.number().when('mode', {
        is: PricingMode.FIXED,
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
    })
    .required(),
  categories: Joi.array().items(Joi.string()).default([]),
  tags: Joi.array().items(Joi.string()).default([]),
  status: Joi.string().valid('publish', 'draft', 'private').required(),
  catalogVisibility: Joi.string().valid('visible', 'catalog', 'search', 'hidden').default('visible'),
  stockStatus: Joi.string().valid('instock', 'outofstock', 'onbackorder').default('instock'),
  manageStock: Joi.boolean().default(false),
  stockQuantity: Joi.number().integer().min(0).optional(),
  autoGenerateVariations: Joi.boolean().default(true),
  variationPriceMode: Joi.string().valid('original', 'markup').default('original'),
  variationMarkupType: Joi.string().valid('percentage', 'fixed').when('variationPriceMode', {
    is: 'markup',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  variationMarkupValue: Joi.number().when('variationPriceMode', {
    is: 'markup',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  maxImages: Joi.number().integer().min(0).optional(),
});

export const ExecuteImportSchema = Joi.object().keys({
  storeId: Joi.string()
    .required()
    .regex(/^[a-f\d]{24}$/i)
    .messages({ 'string.pattern.base': 'Invalid store ID format' }),
  source: Joi.string()
    .valid(...Object.values(ImportSource))
    .required(),
  sourceUrl: Joi.string().uri().required(),
  products: Joi.array().items(SelectedProductSchema).min(1).required().messages({
    'array.min': 'At least one product must be selected for import',
  }),
  settings: ImportSettingsSchema.required(),
});

// ============ Language Param Schema ============

export const LanguageSchema = Joi.string().valid('en', 'ar').required();
