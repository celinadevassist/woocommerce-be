import * as Joi from 'joi';
import { ProductionBatchStatus, ProductionBatchType } from './enum';

// Consumed material in batch
export const ConsumedMaterialSchema = Joi.object({
  materialId: Joi.string().required(),
  plannedQuantity: Joi.number().positive().required(),
  actualQuantity: Joi.number().min(0).optional(),
  unit: Joi.string().required(),
});

// Create Production Batch DTO
export class CreateProductionBatchDto {
  skuId: string;
  type?: ProductionBatchType;
  plannedQuantity: number;
  consumedMaterials?: {
    materialId: string;
    plannedQuantity: number;
    unit: string;
  }[];
  laborCost?: number;
  overheadCost?: number;
  notes?: string;
  plannedStartDate?: Date;
}

export const CreateProductionBatchSchema = Joi.object({
  skuId: Joi.string().required(),
  type: Joi.string().valid(...Object.values(ProductionBatchType)).optional(),
  plannedQuantity: Joi.number().integer().positive().required(),
  consumedMaterials: Joi.array().items(ConsumedMaterialSchema).optional(),
  laborCost: Joi.number().min(0).optional(),
  overheadCost: Joi.number().min(0).optional(),
  notes: Joi.string().allow('').optional(),
  plannedStartDate: Joi.date().optional(),
});

// Update Production Batch DTO
export class UpdateProductionBatchDto {
  type?: ProductionBatchType;
  plannedQuantity?: number;
  consumedMaterials?: {
    materialId: string;
    plannedQuantity: number;
    actualQuantity?: number;
    unit: string;
  }[];
  laborCost?: number;
  overheadCost?: number;
  notes?: string;
  plannedStartDate?: Date;
}

export const UpdateProductionBatchSchema = Joi.object({
  type: Joi.string().valid(...Object.values(ProductionBatchType)).optional(),
  plannedQuantity: Joi.number().integer().positive().optional(),
  consumedMaterials: Joi.array().items(ConsumedMaterialSchema).optional(),
  laborCost: Joi.number().min(0).optional(),
  overheadCost: Joi.number().min(0).optional(),
  notes: Joi.string().allow('').optional(),
  plannedStartDate: Joi.date().optional(),
});

// Start Production DTO
export class StartProductionDto {
  actualStartDate?: Date;
}

export const StartProductionSchema = Joi.object({
  actualStartDate: Joi.date().optional(),
});

// Complete Production DTO
export class CompleteProductionDto {
  completedQuantity: number;
  defectQuantity?: number;
  actualMaterials?: {
    materialId: string;
    actualQuantity: number;
  }[];
  notes?: string;
}

export const CompleteProductionSchema = Joi.object({
  completedQuantity: Joi.number().integer().min(0).required(),
  defectQuantity: Joi.number().integer().min(0).optional(),
  actualMaterials: Joi.array().items(
    Joi.object({
      materialId: Joi.string().required(),
      actualQuantity: Joi.number().min(0).required(),
    })
  ).optional(),
  notes: Joi.string().allow('').optional(),
});

// Cancel Production DTO
export class CancelProductionDto {
  reason?: string;
}

export const CancelProductionSchema = Joi.object({
  reason: Joi.string().allow('').optional(),
});

// Query Production Batches DTO
export class QueryProductionBatchDto {
  storeId?: string;
  skuId?: string;
  status?: ProductionBatchStatus;
  type?: ProductionBatchType;
  startDate?: Date;
  endDate?: Date;
  keyword?: string;
  page?: number;
  size?: number;
}

export const QueryProductionBatchSchema = Joi.object({
  storeId: Joi.string().optional(),
  skuId: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(ProductionBatchStatus)).optional(),
  type: Joi.string().valid(...Object.values(ProductionBatchType)).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  keyword: Joi.string().allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(100).default(20),
});
