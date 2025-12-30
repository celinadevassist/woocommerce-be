import * as Joi from 'joi';
import { AssetCategory, AssetStatus, MaintenanceType, DepreciationMethod } from './enum';

// ========================
// Fixed Asset DTOs
// ========================

export class CreateFixedAssetDto {
  name: string;
  assetTag: string;
  category: AssetCategory;
  description?: string;
  serialNumber?: string;
  purchaseDate: string;
  purchaseCost: number;
  supplier?: string;
  status?: AssetStatus;
  location?: string;
  assignedTo?: string;
  warranty?: {
    expiresAt?: string;
    provider?: string;
    notes?: string;
  };
  usefulLifeYears?: number;
  salvageValue?: number;
  depreciationMethod?: DepreciationMethod;
  nextServiceDate?: string;
  notes?: string;
}

export const CreateFixedAssetSchema = Joi.object({
  name: Joi.string().required().trim().max(200),
  assetTag: Joi.string().required().trim().max(50),
  category: Joi.string().valid(...Object.values(AssetCategory)).required(),
  description: Joi.string().optional().trim().max(1000).allow(''),
  serialNumber: Joi.string().optional().trim().max(100).allow(''),
  purchaseDate: Joi.string().required().isoDate(),
  purchaseCost: Joi.number().min(0).required(),
  supplier: Joi.string().optional().trim().max(200).allow(''),
  status: Joi.string().valid(...Object.values(AssetStatus)).optional().default(AssetStatus.ACTIVE),
  location: Joi.string().optional().trim().max(200).allow(''),
  assignedTo: Joi.string().optional().trim().max(200).allow(''),
  warranty: Joi.object({
    expiresAt: Joi.string().optional().isoDate(),
    provider: Joi.string().optional().trim().max(200).allow(''),
    notes: Joi.string().optional().trim().max(500).allow(''),
  }).optional(),
  usefulLifeYears: Joi.number().integer().min(1).max(50).optional().default(5),
  salvageValue: Joi.number().min(0).optional().default(0),
  depreciationMethod: Joi.string().valid(...Object.values(DepreciationMethod)).optional().default(DepreciationMethod.STRAIGHT_LINE),
  nextServiceDate: Joi.string().optional().isoDate(),
  notes: Joi.string().optional().trim().max(1000).allow(''),
});

export class UpdateFixedAssetDto {
  name?: string;
  assetTag?: string;
  category?: AssetCategory;
  description?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  supplier?: string;
  status?: AssetStatus;
  location?: string;
  assignedTo?: string;
  warranty?: {
    expiresAt?: string;
    provider?: string;
    notes?: string;
  };
  usefulLifeYears?: number;
  salvageValue?: number;
  depreciationMethod?: DepreciationMethod;
  nextServiceDate?: string;
  notes?: string;
}

export const UpdateFixedAssetSchema = Joi.object({
  name: Joi.string().optional().trim().max(200),
  assetTag: Joi.string().optional().trim().max(50),
  category: Joi.string().valid(...Object.values(AssetCategory)).optional(),
  description: Joi.string().optional().trim().max(1000).allow(''),
  serialNumber: Joi.string().optional().trim().max(100).allow(''),
  purchaseDate: Joi.string().optional().isoDate(),
  purchaseCost: Joi.number().min(0).optional(),
  supplier: Joi.string().optional().trim().max(200).allow(''),
  status: Joi.string().valid(...Object.values(AssetStatus)).optional(),
  location: Joi.string().optional().trim().max(200).allow(''),
  assignedTo: Joi.string().optional().trim().max(200).allow(''),
  warranty: Joi.object({
    expiresAt: Joi.string().optional().isoDate().allow(null),
    provider: Joi.string().optional().trim().max(200).allow(''),
    notes: Joi.string().optional().trim().max(500).allow(''),
  }).optional().allow(null),
  usefulLifeYears: Joi.number().integer().min(1).max(50).optional(),
  salvageValue: Joi.number().min(0).optional(),
  depreciationMethod: Joi.string().valid(...Object.values(DepreciationMethod)).optional(),
  nextServiceDate: Joi.string().optional().isoDate().allow(null),
  notes: Joi.string().optional().trim().max(1000).allow(''),
}).min(1);

// ========================
// Maintenance Log DTOs
// ========================

export class CreateMaintenanceLogDto {
  date: string;
  type: MaintenanceType;
  description: string;
  cost?: number;
  performedBy?: string;
  nextServiceDate?: string;
}

export const CreateMaintenanceLogSchema = Joi.object({
  date: Joi.string().required().isoDate(),
  type: Joi.string().valid(...Object.values(MaintenanceType)).required(),
  description: Joi.string().required().trim().max(1000),
  cost: Joi.number().min(0).optional().default(0),
  performedBy: Joi.string().optional().trim().max(200).allow(''),
  nextServiceDate: Joi.string().optional().isoDate(),
});

// ========================
// Query DTOs
// ========================

export class QueryFixedAssetDto {
  storeId: string;
  category?: AssetCategory;
  status?: AssetStatus;
  keyword?: string;
  maintenanceDue?: boolean;
  page?: number;
  size?: number;
}

export const QueryFixedAssetSchema = Joi.object({
  storeId: Joi.string().required().regex(/^[0-9a-fA-F]{24}$/),
  category: Joi.string().valid(...Object.values(AssetCategory)).optional(),
  status: Joi.string().valid(...Object.values(AssetStatus)).optional(),
  keyword: Joi.string().optional().trim().max(100),
  maintenanceDue: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  size: Joi.number().integer().min(1).max(100).optional().default(20),
});
