import { SKUStatus } from './enum';

export interface IBOMMaterial {
  materialId: string;
  materialName?: string;
  materialSku?: string;
  quantity: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
  notes?: string;
}

export interface ISKU {
  _id: string;
  storeId: string;
  sku: string;
  title: string;
  description?: string;
  specs?: Record<string, any>;
  category?: string;
  status: SKUStatus;
  materials: IBOMMaterial[];
  laborCost: number;
  overheadCost: number;
  fixedCost: boolean;
  cost: number;
  calculatedCost: number;
  sellingPrice: number;
  images: string[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISKUResponse {
  skus: ISKU[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface ISKUCostBreakdown {
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  materials: {
    materialId: string;
    materialName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }[];
}
