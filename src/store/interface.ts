import { StorePlatform, StoreStatus, SyncStatus } from './enum';

export interface IStoreCredentials {
  consumerKey: string;
  consumerSecret: string;
}

export interface ISyncStatusDetail {
  lastSync?: Date;
  status: SyncStatus;
  itemCount: number;
  error?: string;
}

export interface IStoreSettings {
  autoSync: boolean;
  syncInterval: number; // minutes
  lowStockThreshold: number;
  timezone?: string;
  currency?: string;
}

export interface IStore {
  _id: string;
  organizationId: string;
  name: string;
  platform: StorePlatform;
  url: string;
  status: StoreStatus;
  lastSyncAt?: Date;
  syncStatus: {
    products?: ISyncStatusDetail;
    orders?: ISyncStatusDetail;
    customers?: ISyncStatusDetail;
    reviews?: ISyncStatusDetail;
  };
  settings: IStoreSettings;
  productCount?: number;
  orderCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreResponse {
  stores: IStore[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface IConnectionTestResult {
  success: boolean;
  message: string;
  storeInfo?: {
    name: string;
    url: string;
    version: string;
    currency: string;
    timezone: string;
  };
}
