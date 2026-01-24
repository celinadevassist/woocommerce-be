export enum ImportStatus {
  PENDING = 'pending',
  FETCHING = 'fetching',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ImportSource {
  SHOPIFY = 'shopify',
  // Future: ALIEXPRESS = 'aliexpress',
  // Future: AMAZON = 'amazon',
}

export enum PricingMode {
  EMPTY = 'empty', // Keep prices empty (default)
  KEEP = 'keep', // Use original Shopify prices
  MARKUP = 'markup', // Apply markup to Shopify prices
  FIXED = 'fixed', // Set fixed price for all products
}

export enum MarkupType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}
