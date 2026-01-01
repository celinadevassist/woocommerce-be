export enum OrderItemStockStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export enum OrderItemSource {
  WOOCOMMERCE = 'woocommerce',
  MANUAL = 'manual',
  API = 'api',
}
