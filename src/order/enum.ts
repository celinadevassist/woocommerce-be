export enum OrderStatus {
  DRAFT = 'draft',           // Manual order being edited
  PENDING = 'pending',
  CONFIRMED = 'confirmed',   // Ready for fulfillment
  PROCESSING = 'processing',
  ON_HOLD = 'on-hold',
  SHIPPED = 'shipped',       // In transit
  DELIVERED = 'delivered',   // Received by customer
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  FAILED = 'failed',
  TRASH = 'trash',
}

export enum OrderSource {
  WOOCOMMERCE = 'woocommerce',
  MANUAL = 'manual',
  API = 'api',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum FulfillmentStatus {
  UNFULFILLED = 'unfulfilled',
  PARTIALLY_FULFILLED = 'partially_fulfilled',
  FULFILLED = 'fulfilled',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
}
