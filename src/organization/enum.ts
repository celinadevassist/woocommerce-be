export enum OrganizationMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  STAFF = 'staff',
  VIEWER = 'viewer',
}

// Store limit is unlimited - each store is billed $19/month
export const STORE_PRICE_PER_MONTH = 19;
export const BILLING_CYCLE_DAYS = 30;
