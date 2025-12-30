import { Types } from 'mongoose';
import { AssetCategory, AssetStatus, MaintenanceType, DepreciationMethod } from './enum';

export interface IWarranty {
  expiresAt: Date;
  provider: string;
  notes?: string;
}

export interface IMaintenanceLog {
  _id: Types.ObjectId;
  date: Date;
  type: MaintenanceType;
  description: string;
  cost: number;
  performedBy?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IFixedAsset {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  name: string;
  assetTag: string;
  category: AssetCategory;
  description?: string;
  serialNumber?: string;
  purchaseDate: Date;
  purchaseCost: number;
  supplier?: string;
  status: AssetStatus;
  location?: string;
  assignedTo?: string;
  warranty?: IWarranty;
  usefulLifeYears?: number;
  salvageValue?: number;
  depreciationMethod: DepreciationMethod;
  maintenanceHistory: IMaintenanceLog[];
  nextServiceDate?: Date;
  notes?: string;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAssetWithDepreciation extends IFixedAsset {
  currentBookValue: number;
  accumulatedDepreciation: number;
  monthlyDepreciation: number;
}

export interface IAssetSummary {
  totalAssets: number;
  totalPurchaseValue: number;
  totalBookValue: number;
  totalDepreciation: number;
  byCategory: Record<string, { count: number; value: number }>;
  byStatus: Record<string, number>;
  maintenanceDueCount: number;
  warrantyExpiringCount: number;
}

export interface IAssetResponse {
  assets: IAssetWithDepreciation[];
  total: number;
  page: number;
  pages: number;
}
