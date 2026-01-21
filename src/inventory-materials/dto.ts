import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as Joi from 'joi';
import {
  MaterialUnit,
  MaterialTransactionType,
  MaterialTransactionReferenceType,
} from './enum';

// Supplier DTO
export class SupplierDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  contactPerson?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  notes?: string;
}

const SupplierSchema = Joi.object({
  name: Joi.string().required(),
  contactPerson: Joi.string().optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  phone: Joi.string().optional().allow(''),
  notes: Joi.string().optional().allow(''),
});

// Create Material DTO
export class CreateMaterialDto {
  @ApiProperty({ description: 'Unique material code' })
  sku: string;

  @ApiProperty({ description: 'Material name' })
  name: string;

  @ApiPropertyOptional({ description: 'Material description' })
  description?: string;

  @ApiProperty({ enum: MaterialUnit, description: 'Unit of measurement' })
  unit: MaterialUnit;

  @ApiPropertyOptional({ description: 'Material category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Minimum stock level for alerts' })
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Stock level to trigger reorder' })
  reorderPoint?: number;

  @ApiPropertyOptional({ description: 'Suggested reorder quantity' })
  reorderQuantity?: number;

  @ApiPropertyOptional({
    type: [SupplierDto],
    description: 'List of suppliers',
  })
  suppliers?: SupplierDto[];
}

export const CreateMaterialSchema = Joi.object({
  sku: Joi.string().min(1).max(50).required(),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().optional().allow(''),
  unit: Joi.string()
    .valid(...Object.values(MaterialUnit))
    .required(),
  category: Joi.string().optional().allow(''),
  minStockLevel: Joi.number().min(0).optional().default(0),
  reorderPoint: Joi.number().min(0).optional().default(0),
  reorderQuantity: Joi.number().min(0).optional().default(0),
  suppliers: Joi.array().items(SupplierSchema).optional().default([]),
});

// Update Material DTO
export class UpdateMaterialDto {
  @ApiPropertyOptional({ description: 'Material name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Material description' })
  description?: string;

  @ApiPropertyOptional({
    enum: MaterialUnit,
    description: 'Unit of measurement',
  })
  unit?: MaterialUnit;

  @ApiPropertyOptional({ description: 'Material category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Minimum stock level for alerts' })
  minStockLevel?: number;

  @ApiPropertyOptional({ description: 'Stock level to trigger reorder' })
  reorderPoint?: number;

  @ApiPropertyOptional({ description: 'Suggested reorder quantity' })
  reorderQuantity?: number;

  @ApiPropertyOptional({
    type: [SupplierDto],
    description: 'List of suppliers',
  })
  suppliers?: SupplierDto[];
}

export const UpdateMaterialSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().optional().allow(''),
  unit: Joi.string()
    .valid(...Object.values(MaterialUnit))
    .optional(),
  category: Joi.string().optional().allow(''),
  minStockLevel: Joi.number().min(0).optional(),
  reorderPoint: Joi.number().min(0).optional(),
  reorderQuantity: Joi.number().min(0).optional(),
  suppliers: Joi.array().items(SupplierSchema).optional(),
});

// Query Material DTO
export class QueryMaterialDto {
  @ApiPropertyOptional({ description: 'Store ID' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Search keyword' })
  keyword?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  size?: number;

  @ApiPropertyOptional({ description: 'Sort field' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order (asc/desc)' })
  sortOrder?: 'asc' | 'desc';
}

export const QueryMaterialSchema = Joi.object({
  storeId: Joi.string().optional(),
  category: Joi.string().optional(),
  keyword: Joi.string().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(20),
  sortBy: Joi.string()
    .valid('name', 'sku', 'currentStock', 'averageCost', 'createdAt')
    .optional()
    .default('name'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('asc'),
});

// Add Stock DTO (for purchases)
export class AddStockDto {
  @ApiProperty({ description: 'Quantity to add' })
  quantity: number;

  @ApiProperty({ description: 'Cost per unit' })
  unitCost: number;

  @ApiPropertyOptional({ description: 'Reference (e.g., PO number)' })
  reference?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  notes?: string;
}

export const AddStockSchema = Joi.object({
  quantity: Joi.number().greater(0).required(),
  unitCost: Joi.number().min(0).required(),
  reference: Joi.string().optional().allow(''),
  notes: Joi.string().optional().allow(''),
});

// Adjust Stock DTO (for corrections, waste)
export class AdjustStockDto {
  @ApiProperty({ enum: ['ADJUST', 'WASTE'], description: 'Type of adjustment' })
  type: 'ADJUST' | 'WASTE';

  @ApiProperty({
    description: 'Quantity change (positive to add, negative to remove)',
  })
  quantity: number;

  @ApiPropertyOptional({ description: 'Reference' })
  reference?: string;

  @ApiProperty({ description: 'Reason for adjustment' })
  notes: string;
}

export const AdjustStockSchema = Joi.object({
  type: Joi.string().valid('ADJUST', 'WASTE').required(),
  quantity: Joi.number().not(0).required(),
  reference: Joi.string().optional().allow(''),
  notes: Joi.string().required(),
});

// Query Transactions DTO
export class QueryTransactionsDto {
  @ApiPropertyOptional({ description: 'Filter by transaction type' })
  type?: MaterialTransactionType;

  @ApiPropertyOptional({ description: 'Filter by reference type' })
  referenceType?: MaterialTransactionReferenceType;

  @ApiPropertyOptional({ description: 'Start date' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  size?: number;
}

export const QueryTransactionsSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(MaterialTransactionType))
    .optional(),
  referenceType: Joi.string()
    .valid(...Object.values(MaterialTransactionReferenceType))
    .optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  page: Joi.number().min(1).optional().default(1),
  size: Joi.number().min(1).max(100).optional().default(20),
});
