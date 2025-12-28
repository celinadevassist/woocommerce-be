import { InventoryChangeType, AlertType, AlertStatus } from './enum';

export interface IInventoryLog {
  _id: string;
  productId: string;
  variantId?: string;
  storeId: string;
  organizationId: string;
  previousQuantity: number;
  newQuantity: number;
  quantityChange: number;
  changeType: InventoryChangeType;
  reason?: string;
  reference?: string;
  changedBy?: string;
  sku?: string;
  productName?: string;
  createdAt: Date;
}

export interface IStockAlert {
  _id: string;
  productId: string;
  variantId?: string;
  storeId: string;
  organizationId: string;
  alertType: AlertType;
  status: AlertStatus;
  currentQuantity: number;
  threshold?: number;
  sku?: string;
  productName?: string;
  resolvedAt?: Date;
  dismissedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInventoryOverview {
  totalProducts: number;
  totalInStock: number;
  totalOutOfStock: number;
  totalLowStock: number;
  totalValue?: number; // Sum of (price * quantity)
}

export interface IInventoryLogsResponse {
  logs: IInventoryLog[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface IStockAlertsResponse {
  alerts: IStockAlert[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}
