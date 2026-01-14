// WooCommerce API Types

export interface WooCommerceCredentials {
  url: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooStoreInfo {
  name: string;
  description: string;
  url: string;
  wc_version: string;
  version: string;
}

export interface WooSettingsGeneral {
  id: string;
  label: string;
  value: string;
}

export interface WooProductDownload {
  id?: string;
  name: string;
  file: string;
}

export interface WooDefaultAttribute {
  id: number;
  name: string;
  option: string;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  type: 'simple' | 'grouped' | 'external' | 'variable';
  status: 'draft' | 'pending' | 'private' | 'publish';
  featured: boolean;
  catalog_visibility: 'visible' | 'catalog' | 'search' | 'hidden';
  description: string;
  short_description: string;
  sku: string;
  global_unique_id?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  price_html: string;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads: WooProductDownload[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
  tax_status: 'taxable' | 'shipping' | 'none';
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: 'no' | 'notify' | 'yes';
  backorders_allowed: boolean;
  backordered: boolean;
  sold_individually: boolean;
  low_stock_amount: number | null;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  related_ids: number[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note: string;
  categories: WooCategory[];
  tags: WooTag[];
  images: WooImage[];
  attributes: WooAttribute[];
  default_attributes: WooDefaultAttribute[];
  variations: number[];
  grouped_products: number[];
  menu_order: number;
  meta_data: WooMetaData[];
}

export interface WooProductVariation {
  id: number;
  date_created: string;
  date_modified: string;
  description: string;
  permalink: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  status: 'publish' | 'private';
  purchasable: boolean;
  virtual: boolean;
  downloadable: boolean;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: 'no' | 'notify' | 'yes';
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  image: WooImage;
  attributes: WooVariationAttribute[];
  meta_data: WooMetaData[];
}

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  display: string;
  image: WooImage | null;
  menu_order: number;
  count: number;
}

export interface WooCategoryFull {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  display: string;
  image: WooImage | null;
  menu_order: number;
  count: number;
  _links?: any;
}

export interface WooCategoryCreate {
  name: string;
  slug?: string;
  parent?: number;
  description?: string;
  display?: string;
  image?: { src: string; alt?: string };
  menu_order?: number;
}

export interface WooCategoryUpdate {
  name?: string;
  slug?: string;
  parent?: number;
  description?: string;
  display?: string;
  image?: { src: string; alt?: string } | null;
  menu_order?: number;
}

export interface WooTag {
  id: number;
  name: string;
  slug: string;
}

export interface WooTagFull {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  _links?: any;
}

export interface WooTagCreate {
  name: string;
  slug?: string;
  description?: string;
}

export interface WooTagUpdate {
  name?: string;
  slug?: string;
  description?: string;
}

export interface WooImage {
  id: number;
  date_created: string;
  date_modified: string;
  src: string;
  name: string;
  alt: string;
}

export interface WooAttribute {
  id: number;
  name: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface WooVariationAttribute {
  id: number;
  name: string;
  option: string;
}

export interface WooMetaData {
  id: number;
  key: string;
  value: any;
}

export interface WooOrder {
  id: number;
  parent_id: number;
  number: string;
  order_key: string;
  created_via: string;
  version: string;
  status: WooOrderStatus;
  currency: string;
  date_created: string;
  date_modified: string;
  discount_total: string;
  discount_tax: string;
  shipping_total: string;
  shipping_tax: string;
  cart_tax: string;
  total: string;
  total_tax: string;
  prices_include_tax: boolean;
  customer_id: number;
  customer_note: string;
  billing: WooAddress;
  shipping: WooAddress;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  date_paid: string | null;
  date_completed: string | null;
  line_items: WooOrderLineItem[];
  shipping_lines: WooShippingLine[];
  fee_lines: WooFeeLine[];
  coupon_lines: WooCouponLine[];
  meta_data: WooMetaData[];
}

export type WooOrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed'
  | 'trash';

export interface WooAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface WooOrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  tax_class: string;
  subtotal: string;
  subtotal_tax: string;
  total: string;
  total_tax: string;
  sku: string;
  price: number;
  meta_data: WooMetaData[];
}

export interface WooShippingLine {
  id: number;
  method_title: string;
  method_id: string;
  total: string;
  total_tax: string;
}

export interface WooFeeLine {
  id: number;
  name: string;
  tax_class: string;
  tax_status: string;
  total: string;
  total_tax: string;
}

export interface WooCouponLine {
  id: number;
  code: string;
  discount: string;
  discount_tax: string;
}

export interface WooCustomer {
  id: number;
  date_created: string;
  date_modified: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  username: string;
  billing: WooAddress;
  shipping: WooAddress;
  is_paying_customer: boolean;
  avatar_url: string;
  meta_data: WooMetaData[];
}

export interface WooProductReview {
  id: number;
  date_created: string;
  product_id: number;
  status: 'approved' | 'hold' | 'spam' | 'unspam' | 'trash' | 'untrash';
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;
}

export interface WooCoupon {
  id: number;
  code: string;
  amount: string;
  date_created: string;
  date_modified: string;
  date_expires: string | null;
  discount_type: 'percent' | 'fixed_cart' | 'fixed_product';
  description: string;
  usage_count: number;
  individual_use: boolean;
  product_ids: number[];
  excluded_product_ids: number[];
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  limit_usage_to_x_items: number | null;
  free_shipping: boolean;
  exclude_sale_items: boolean;
  minimum_amount: string;
  maximum_amount: string;
  email_restrictions: string[];
  used_by: string[];
  meta_data: WooMetaData[];
}

// API Response types
export interface WooPaginatedResponse<T> {
  data: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

export interface WooProductUpdatePayload {
  name?: string;
  regular_price?: string;
  sale_price?: string;
  description?: string;
  short_description?: string;
  sku?: string;
  manage_stock?: boolean;
  stock_quantity?: number;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  status?: 'draft' | 'pending' | 'private' | 'publish';
  categories?: { id: number }[];
  tags?: { id: number }[];
  images?: { src: string; alt?: string }[];
}

export interface WooStockUpdatePayload {
  stock_quantity: number;
  manage_stock?: boolean;
}

export interface WooVariationUpdatePayload {
  regular_price?: string;
  sale_price?: string;
  description?: string;
  sku?: string;
  manage_stock?: boolean;
  stock_quantity?: number;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  status?: 'draft' | 'pending' | 'private' | 'publish';
}

// Product Attributes
export interface WooProductAttribute {
  id: number;
  name: string;
  slug: string;
  type: string;
  order_by: string;
  has_archives: boolean;
}

export interface WooProductAttributeCreate {
  name: string;
  slug?: string;
  type?: string;
  order_by?: string;
  has_archives?: boolean;
}

export interface WooProductAttributeUpdate {
  name?: string;
  slug?: string;
  type?: string;
  order_by?: string;
  has_archives?: boolean;
}

// Attribute Terms
export interface WooAttributeTerm {
  id: number;
  name: string;
  slug: string;
  description: string;
  menu_order: number;
  count: number;
}

export interface WooAttributeTermCreate {
  name: string;
  slug?: string;
  description?: string;
  menu_order?: number;
}

export interface WooAttributeTermUpdate {
  name?: string;
  slug?: string;
  description?: string;
  menu_order?: number;
}

// ============== SHIPPING TYPES ==============

// Shipping Zone
export interface WooShippingZone {
  id: number;
  name: string;
  order: number;
}

export interface WooShippingZoneCreate {
  name: string;
  order?: number;
}

export interface WooShippingZoneUpdate {
  name?: string;
  order?: number;
}

// Shipping Zone Location
export interface WooShippingZoneLocation {
  code: string;
  type: 'postcode' | 'state' | 'country' | 'continent';
}

// Shipping Zone Method
export interface WooShippingZoneMethod {
  instance_id: number;
  title: string;
  order: number;
  enabled: boolean;
  method_id: string;
  method_title: string;
  method_description: string;
  settings: WooShippingMethodSettings;
}

export interface WooShippingMethodSettings {
  title?: WooShippingSetting;
  tax_status?: WooShippingSetting;
  cost?: WooShippingSetting;
  class_costs?: WooShippingSetting;
  no_class_cost?: WooShippingSetting;
  type?: WooShippingSetting;
  requires?: WooShippingSetting;
  min_amount?: WooShippingSetting;
  ignore_discounts?: WooShippingSetting;
  [key: string]: WooShippingSetting | undefined;
}

export interface WooShippingSetting {
  id: string;
  label: string;
  description: string;
  type: string;
  value: string;
  default: string;
  tip: string;
  placeholder: string;
  options?: { [key: string]: string };
}

export interface WooShippingZoneMethodCreate {
  method_id: string;
  order?: number;
  enabled?: boolean;
  settings?: { [key: string]: string };
}

export interface WooShippingZoneMethodUpdate {
  order?: number;
  enabled?: boolean;
  settings?: { [key: string]: string };
}

// Available Shipping Methods (system-wide)
export interface WooShippingMethod {
  id: string;
  title: string;
  description: string;
}
