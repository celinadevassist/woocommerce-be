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
