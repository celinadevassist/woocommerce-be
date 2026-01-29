export enum ReviewStatus {
  APPROVED = 'approved',
  HOLD = 'hold',
  SPAM = 'spam',
  TRASH = 'trash',
}

export enum ReviewSource {
  WOOCOMMERCE = 'woocommerce',
  MANUAL = 'manual',
  REVIEW_REQUEST = 'review_request',
  IMPORT = 'import',
  PUBLIC_API = 'public_api',
}

export enum ReviewType {
  PRODUCT = 'product',
  GENERAL = 'general',
  SERVICE = 'service',
}

export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged',
}
