import { Types } from 'mongoose';
import { StockTransactionType, StockStatus } from './enum';

// Product Stock document
export interface IProductStock {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  productId: Types.ObjectId;        // Reference to Product
  variantId?: Types.ObjectId;       // Reference to Variant (optional)
  skuId?: Types.ObjectId;           // Reference to SKU definition (optional)
  sku: string;                      // SKU code for quick lookup
  productName: string;              // Cached for display
  variantName?: string;             // Cached for display
  currentStock: number;
  reservedStock: number;            // Reserved for pending orders
  availableStock: number;           // currentStock - reservedStock
  minStockLevel: number;            // Alert threshold
  reorderPoint: number;
  reorderQuantity: number;
  unitCost: number;                 // Average/last cost
  totalValue: number;               // currentStock * unitCost
  status: StockStatus;
  location?: string;                // Warehouse/location
  lastRestockedAt?: Date;
  hasUnitTracking: boolean;         // True when unit-level tracking is enabled
  unitCount: number;                // Count of in_stock + reserved units
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Stock Transaction document
export interface IStockTransaction {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  stockId: Types.ObjectId;          // Reference to ProductStock
  type: StockTransactionType;
  quantity: number;                 // Positive for in, negative for out
  previousStock: number;
  newStock: number;
  unitCost?: number;
  totalCost?: number;
  reference?: string;               // Order ID, Batch ID, etc.
  referenceType?: string;           // 'order', 'batch', 'manual'
  notes?: string;
  performedBy: Types.ObjectId;
  createdAt: Date;
}

// Response with enriched data
export interface IProductStockResponse extends IProductStock {
  product?: {
    _id: Types.ObjectId;
    name: string;
    wooCommerceId?: number;
  };
  skuDefinition?: {
    _id: Types.ObjectId;
    sku: string;
    title: string;
  };
}

// Stock summary for dashboard
export interface IStockSummary {
  totalProducts: number;
  totalValue: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

// Transaction response with pagination
export interface ITransactionResponse {
  transactions: IStockTransaction[];
  total: number;
  page: number;
  pages: number;
}
