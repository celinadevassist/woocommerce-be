import {
  MaterialUnit,
  MaterialTransactionType,
  MaterialTransactionReferenceType,
} from './enum';

export interface ISupplier {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface IMaterial {
  _id: string;
  storeId: string;
  sku: string;
  name: string;
  description?: string;
  unit: MaterialUnit;
  category?: string;
  minStockLevel: number;
  reorderPoint: number;
  reorderQuantity: number;
  suppliers: ISupplier[];
  currentStock: number;
  averageCost: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMaterialTransaction {
  _id: string;
  storeId: string;
  materialId: string;
  type: MaterialTransactionType;
  quantity: number;
  unitCost?: number;
  totalCost: number;
  previousStock: number;
  newStock: number;
  previousAvgCost?: number;
  newAvgCost?: number;
  reference?: string;
  referenceType: MaterialTransactionReferenceType;
  notes?: string;
  performedBy: string;
  createdAt: Date;
}

export interface IMaterialResponse {
  materials: IMaterial[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface IMaterialTransactionResponse {
  transactions: IMaterialTransaction[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface ILowStockMaterial extends IMaterial {
  stockDeficit: number;
}
