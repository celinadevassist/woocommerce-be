import { CustomerStatus, CustomerSource, CustomerTier } from './enum';

export interface ICustomerAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export interface ICustomerStats {
  ordersCount: number;
  totalSpent: number;
  averageOrderValue?: number;
  lastOrderDate?: Date;
  firstOrderDate?: Date;
}

export interface ICustomerNote {
  _id: string;
  content: string;
  addedBy?: string;
  addedByUserId?: string;
  createdAt: Date;
}

export interface ICustomer {
  _id: string;
  externalId: number;
  storeId: string;
  organizationId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  avatarUrl?: string;
  billing?: ICustomerAddress;
  shipping?: ICustomerAddress;
  status: CustomerStatus;
  source: CustomerSource;
  tier: CustomerTier;
  stats: ICustomerStats;
  role?: string;
  isPayingCustomer: boolean;
  wooCreatedAt?: Date;
  wooModifiedAt?: Date;
  tags: string[];
  notes: ICustomerNote[];
  isDeleted: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomerResponse {
  customers: ICustomer[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface ICustomerAggregateStats {
  totalCustomers: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  repeatCustomers: number;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  averageOrdersPerCustomer: number;
  averageSpentPerCustomer: number;
  topCustomers: ICustomer[];
}
