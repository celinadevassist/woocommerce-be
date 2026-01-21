export enum StorePlatform {
  WOOCOMMERCE = 'woocommerce',
  SHOPIFY = 'shopify', // Future support
}

export enum StoreStatus {
  CONNECTING = 'connecting',
  ACTIVE = 'active',
  ERROR = 'error',
  DISCONNECTED = 'disconnected',
  SYNCING = 'syncing',
}

export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  ERROR = 'error',
}

export enum StoreMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  STAFF = 'staff',
  VIEWER = 'viewer',
}

// Subscription billing constants
export const STORE_PRICE_PER_MONTH = 19; // $19/month per store
export const BILLING_CYCLE_DAYS = 30;
