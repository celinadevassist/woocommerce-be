import * as Joi from 'joi';
import { ProductUnitStatus } from './enum';

// Query Product Units DTO
export class QueryProductUnitDto {
  storeId?: string;
  skuId?: string;
  sku?: string;
  batchId?: string;
  status?: ProductUnitStatus;
  orderId?: string;
  rfidCode?: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  size?: number;
}

export const QueryProductUnitSchema = Joi.object({
  storeId: Joi.string().optional(),
  skuId: Joi.string().optional(),
  sku: Joi.string().optional(),
  batchId: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(ProductUnitStatus)).optional(),
  orderId: Joi.string().optional(),
  rfidCode: Joi.string().optional(),
  location: Joi.string().optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(20),
});

// Update Unit Status DTO
export class UpdateUnitStatusDto {
  status: ProductUnitStatus;
  notes?: string;
  location?: string;
}

export const UpdateUnitStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(ProductUnitStatus)).required(),
  notes: Joi.string().optional().allow(''),
  location: Joi.string().optional().allow(''),
});

// Bulk Lookup DTO
export class BulkLookupDto {
  storeId: string;
  rfidCodes: string[];
}

export const BulkLookupSchema = Joi.object({
  storeId: Joi.string().required(),
  rfidCodes: Joi.array().items(Joi.string()).min(1).max(100).required(),
});

// Generate RFID Codes DTO
export class GenerateRfidDto {
  storeId: string;
  skuCode: string;
  count: number;
}

export const GenerateRfidSchema = Joi.object({
  storeId: Joi.string().required(),
  skuCode: Joi.string().required(),
  count: Joi.number().integer().min(1).max(1000).required(),
});

// Reserve Units DTO
export class ReserveUnitsDto {
  unitIds: string[];
  orderId: string;
}

export const ReserveUnitsSchema = Joi.object({
  unitIds: Joi.array().items(Joi.string()).min(1).required(),
  orderId: Joi.string().required(),
});

// Mark Units as Sold DTO
export class MarkUnitsSoldDto {
  unitIds: string[];
  orderId: string;
  orderNumber: string;
}

export const MarkUnitsSoldSchema = Joi.object({
  unitIds: Joi.array().items(Joi.string()).min(1).required(),
  orderId: Joi.string().required(),
  orderNumber: Joi.string().required(),
});

// Release Reserved Units DTO
export class ReleaseUnitsDto {
  unitIds: string[];
}

export const ReleaseUnitsSchema = Joi.object({
  unitIds: Joi.array().items(Joi.string()).min(1).required(),
});

// Create Units from Batch DTO (internal use)
export class CreateUnitsFromBatchDto {
  storeId: string;
  skuId: string;
  sku: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  rfidCodes?: string[];
  location?: string;
}

export const CreateUnitsFromBatchSchema = Joi.object({
  storeId: Joi.string().required(),
  skuId: Joi.string().required(),
  sku: Joi.string().required(),
  productName: Joi.string().required(),
  batchId: Joi.string().required(),
  batchNumber: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
  unitCost: Joi.number().min(0).required(),
  rfidCodes: Joi.array().items(Joi.string()).optional(),
  location: Joi.string().optional().allow(''),
});
