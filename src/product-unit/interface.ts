import { Types } from 'mongoose';
import { ProductUnitStatus } from './enum';

export interface IProductUnit {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  rfidCode: string;
  skuId: Types.ObjectId;
  sku: string;
  productName: string;
  batchId: Types.ObjectId;
  batchNumber: string;
  unitCost: number;
  status: ProductUnitStatus;
  location?: string;
  orderId?: Types.ObjectId;
  orderNumber?: string;
  soldAt?: Date;
  // Hold tracking
  holdReason?: string;
  holdAt?: Date;
  holdByUserId?: Types.ObjectId;
  // Damaged tracking
  damagedReason?: string;
  damagedAt?: Date;
  damagedByUserId?: Types.ObjectId;
  productionDate: Date;
  notes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductUnitResponse extends IProductUnit {
  skuDefinition?: {
    _id: Types.ObjectId;
    sku: string;
    title: string;
  };
  batch?: {
    _id: Types.ObjectId;
    batchNumber: string;
    completedDate: Date;
  };
  order?: {
    _id: Types.ObjectId;
    orderNumber: string;
    customerName: string;
  };
}

export interface IProductUnitCountsByStatus {
  in_stock: number;
  sold: number;
  damaged: number;
  hold: number;
  total: number;
}

export interface IProductUnitListResponse {
  units: IProductUnit[];
  total: number;
  page: number;
  pages: number;
}

export interface IBulkCreateResult {
  created: number;
  rfidCodes: string[];
}

// Stock aggregation interfaces (replaces ProductStock)
export interface IStockItem {
  skuId: string;
  sku: string;
  productName: string;
  category?: string;
  currentStock: number;      // in_stock count
  holdStock: number;         // hold count
  soldStock: number;         // sold count
  damagedStock: number;      // damaged count
  totalUnits: number;        // total units ever created
  avgUnitCost: number;       // average cost of in_stock units
  totalValue: number;        // currentStock * avgUnitCost
  minStockLevel: number;     // from SKU settings
  reorderPoint: number;      // from SKU settings
  reorderQuantity: number;   // from SKU settings
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastProductionDate?: Date;
}

export interface IStockSummary {
  totalSkus: number;
  totalUnits: number;
  totalValue: number;
  inStock: number;           // SKUs with stock > minLevel
  lowStock: number;          // SKUs with stock <= minLevel but > 0
  outOfStock: number;        // SKUs with stock = 0
}

export interface IStockResponse {
  items: IStockItem[];
  summary: IStockSummary;
  total: number;
  page: number;
  pages: number;
}
