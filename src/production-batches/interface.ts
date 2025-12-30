import { Types } from 'mongoose';
import { ProductionBatchStatus, ProductionBatchType } from './enum';

// Material consumed in production
export interface IConsumedMaterial {
  materialId: Types.ObjectId;
  plannedQuantity: number;
  actualQuantity?: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

// Production batch document
export interface IProductionBatch {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  batchNumber: string;
  skuId: Types.ObjectId;
  type: ProductionBatchType;
  status: ProductionBatchStatus;
  plannedQuantity: number;
  completedQuantity: number;
  defectQuantity: number;
  consumedMaterials: IConsumedMaterial[];
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  costPerUnit: number;
  notes: string;
  plannedStartDate: Date;
  actualStartDate?: Date;
  completedDate?: Date;
  createdBy: Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Response with enriched data
export interface IProductionBatchResponse extends IProductionBatch {
  sku?: {
    _id: Types.ObjectId;
    sku: string;
    title: string;
  };
  consumedMaterials: (IConsumedMaterial & {
    material?: {
      _id: Types.ObjectId;
      sku: string;
      name: string;
    };
  })[];
}

// Cost summary
export interface IProductionBatchCostSummary {
  materialsCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  costPerUnit: number;
  completedQuantity: number;
}
