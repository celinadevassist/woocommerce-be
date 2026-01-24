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
  KEEP = 'keep',
  MARKUP = 'markup',
  FIXED = 'fixed',
}

export enum MarkupType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}
