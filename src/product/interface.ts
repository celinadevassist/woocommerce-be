import { ProductType, ProductStatus, StockStatus, CatalogVisibility } from './enum';

export interface IProductImage {
  externalId?: number;
  src: string;
  name?: string;
  alt?: string;
  position: number;
}

export interface IProductCategory {
  externalId: number;
  name: string;
  slug?: string;
}

export interface IProductTag {
  externalId: number;
  name: string;
  slug?: string;
}

export interface IProductAttribute {
  externalId?: number;
  name: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface IProductDimensions {
  length?: string;
  width?: string;
  height?: string;
}

export interface IVariationAttribute {
  externalId?: number;
  name: string;
  option: string;
}

export interface IProduct {
  _id: string;
  storeId: string;
  organizationId: string;
  externalId: number;
  sku?: string;
  name: string;
  slug?: string;
  permalink?: string;
  type: ProductType;
  status: ProductStatus;
  featured: boolean;
  catalogVisibility: CatalogVisibility;
  description?: string;
  shortDescription?: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  onSale: boolean;
  purchasable: boolean;
  totalSales: number;
  virtual: boolean;
  downloadable: boolean;
  manageStock: boolean;
  stockQuantity: number | null;
  stockStatus: StockStatus;
  lowStockAmount?: number;
  weight?: string;
  dimensions?: IProductDimensions;
  categories: IProductCategory[];
  tags: IProductTag[];
  images: IProductImage[];
  attributes: IProductAttribute[];
  variationIds: number[];
  variationCount: number;
  parentId?: number;
  lastSyncedAt?: Date;
  pendingSync: boolean;
  averageRating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductVariant {
  _id: string;
  productId: string;
  storeId: string;
  organizationId: string;
  externalId: number;
  parentExternalId: number;
  sku?: string;
  permalink?: string;
  description?: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  onSale: boolean;
  status: string;
  purchasable: boolean;
  virtual: boolean;
  downloadable: boolean;
  manageStock: boolean;
  stockQuantity: number | null;
  stockStatus: StockStatus;
  weight?: string;
  dimensions?: IProductDimensions;
  image?: IProductImage;
  attributes: IVariationAttribute[];
  lastSyncedAt?: Date;
  pendingSync: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductWithVariants extends IProduct {
  variants: IProductVariant[];
}

export interface IProductResponse {
  products: IProduct[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}
