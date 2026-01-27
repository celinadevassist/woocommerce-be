import { ImportSource, PricingMode, MarkupType, ImportStatus } from './enum';

// Normalized external product structure (common format for all sources)
export interface IExternalProduct {
  externalId: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  images: IExternalImage[];
  variants: IExternalVariant[];
  options: IExternalOption[];
  // Computed fields
  type: 'simple' | 'variable';
  priceRange: { min: number; max: number };
}

export interface IExternalImage {
  src: string;
  alt?: string;
  position: number;
}

export interface IExternalVariant {
  externalId: string;
  title: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  options: { name: string; value: string }[];
  available: boolean;
  weight?: number;
  weightUnit?: string;
  image?: { src: string; alt?: string }; // Variant-specific image
}

export interface IExternalOption {
  name: string;
  position: number;
  values: string[];
}

// Shopify-specific raw types
export interface IShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  published_at: string;
  created_at: string;
  updated_at: string;
  variants: IShopifyVariant[];
  images: IShopifyImage[];
  options: IShopifyOption[];
}

export interface IShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  grams: number;
  requires_shipping: boolean;
  taxable: boolean;
  position: number;
  product_id: number;
  created_at: string;
  updated_at: string;
}

export interface IShopifyImage {
  id: number;
  src: string;
  alt?: string;
  position: number;
  width: number;
  height: number;
  product_id: number;
  variant_ids: number[];
}

export interface IShopifyOption {
  name: string;
  position: number;
  values: string[];
}

export interface IShopifyProductsResponse {
  products: IShopifyProduct[];
}

// Import settings applied to all products
export interface IImportSettings {
  // Pricing
  pricing: {
    mode: PricingMode;
    markupType?: MarkupType;
    markupValue?: number;
    fixedPrice?: number;
  };

  // Categorization
  categories?: string[];
  tags?: string[];

  // Status
  status: 'publish' | 'draft' | 'private';
  catalogVisibility?: 'visible' | 'catalog' | 'search' | 'hidden';

  // Stock
  stockStatus?: 'instock' | 'outofstock' | 'onbackorder';
  manageStock?: boolean;
  stockQuantity?: number;

  // Variations
  autoGenerateVariations?: boolean;
  variationPriceMode?: 'original' | 'markup';
  variationMarkupType?: 'percentage' | 'fixed';
  variationMarkupValue?: number;

  // Images
  maxImages?: number; // Limit number of images per product (0 = no images, undefined = all)

  // Selected attributes for variable products
  attributes?: {
    id?: number; // WooCommerce attribute ID for global attributes
    name: string;
    options: string[];
    visible?: boolean;
    variation?: boolean;
  }[];
}

// Import job result for tracking
export interface IImportResult {
  externalId: string;
  title: string;
  status: 'success' | 'failed' | 'skipped';
  productId?: string;
  wooProductId?: number;
  variationsGenerated?: number;
  error?: string;
  duration?: number;
}

// Fetch options
export interface IFetchOptions {
  includeDescription?: boolean;
  includeImages?: boolean;
  includeVariants?: boolean;
  limit?: number;
  page?: number;
}

// Selected product for import
export interface ISelectedProduct {
  externalId: string;
  title: string;
  type: 'simple' | 'variable';
  images: IExternalImage[];
  variants: IExternalVariant[];
  options: IExternalOption[];
  description?: string;
  tags?: string[];
  vendor?: string;
}

// Import job progress
export interface IImportProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  current?: string;
  percentage: number;
}
