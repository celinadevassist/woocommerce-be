export enum ProductType {
  SIMPLE = 'simple',
  VARIABLE = 'variable',
  GROUPED = 'grouped',
  EXTERNAL = 'external',
}

export enum ProductStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PRIVATE = 'private',
  PUBLISH = 'publish',
}

export enum StockStatus {
  IN_STOCK = 'instock',
  OUT_OF_STOCK = 'outofstock',
  ON_BACKORDER = 'onbackorder',
}

export enum CatalogVisibility {
  VISIBLE = 'visible',
  CATALOG = 'catalog',
  SEARCH = 'search',
  HIDDEN = 'hidden',
}

export enum TaxStatus {
  TAXABLE = 'taxable',
  SHIPPING = 'shipping',
  NONE = 'none',
}

export enum BackorderStatus {
  NO = 'no',
  NOTIFY = 'notify',
  YES = 'yes',
}
