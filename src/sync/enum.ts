export enum SyncJobType {
  INITIAL = 'initial',
  INCREMENTAL = 'incremental',
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
}

export enum SyncJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum SyncEntityType {
  PRODUCTS = 'products',
  ORDERS = 'orders',
  CUSTOMERS = 'customers',
  REVIEWS = 'reviews',
}

export enum SyncMode {
  FULL = 'full',       // Sync all records from WooCommerce
  DELTA = 'delta',     // Sync only records modified since last sync
}
