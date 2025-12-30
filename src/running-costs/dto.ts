import * as Joi from 'joi';
import { CostType, CostCategory } from './enum';

// ========================
// Cost Template DTOs
// ========================

export class CreateCostTemplateDto {
  name: string;
  description?: string;
  type: CostType;
  category: CostCategory;
  defaultAmount: number;
  isActive?: boolean;
}

export const CreateCostTemplateSchema = Joi.object({
  name: Joi.string().required().trim().max(100),
  description: Joi.string().optional().trim().max(500).allow(''),
  type: Joi.string().valid(...Object.values(CostType)).required(),
  category: Joi.string().valid(...Object.values(CostCategory)).required(),
  defaultAmount: Joi.number().min(0).required(),
  isActive: Joi.boolean().optional().default(true),
});

export class UpdateCostTemplateDto {
  name?: string;
  description?: string;
  type?: CostType;
  category?: CostCategory;
  defaultAmount?: number;
  isActive?: boolean;
}

export const UpdateCostTemplateSchema = Joi.object({
  name: Joi.string().optional().trim().max(100),
  description: Joi.string().optional().trim().max(500).allow(''),
  type: Joi.string().valid(...Object.values(CostType)).optional(),
  category: Joi.string().valid(...Object.values(CostCategory)).optional(),
  defaultAmount: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

// ========================
// Cost Entry DTOs
// ========================

export class CreateCostEntryDto {
  templateId?: string;
  name: string;
  type: CostType;
  category: CostCategory;
  month: string;
  amount: number;
  paidAt?: string;
  notes?: string;
}

export const CreateCostEntrySchema = Joi.object({
  templateId: Joi.string().optional().regex(/^[0-9a-fA-F]{24}$/),
  name: Joi.string().required().trim().max(100),
  type: Joi.string().valid(...Object.values(CostType)).required(),
  category: Joi.string().valid(...Object.values(CostCategory)).required(),
  month: Joi.string().required().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // YYYY-MM format
  amount: Joi.number().min(0).required(),
  paidAt: Joi.string().optional().isoDate(),
  notes: Joi.string().optional().trim().max(500).allow(''),
});

export class UpdateCostEntryDto {
  name?: string;
  type?: CostType;
  category?: CostCategory;
  amount?: number;
  paidAt?: string;
  notes?: string;
}

export const UpdateCostEntrySchema = Joi.object({
  name: Joi.string().optional().trim().max(100),
  type: Joi.string().valid(...Object.values(CostType)).optional(),
  category: Joi.string().valid(...Object.values(CostCategory)).optional(),
  amount: Joi.number().min(0).optional(),
  paidAt: Joi.string().optional().isoDate(),
  notes: Joi.string().optional().trim().max(500).allow(''),
}).min(1);

// ========================
// Query DTOs
// ========================

export class QueryCostTemplateDto {
  storeId: string;
  category?: CostCategory;
  type?: CostType;
  isActive?: boolean;
}

export const QueryCostTemplateSchema = Joi.object({
  storeId: Joi.string().required().regex(/^[0-9a-fA-F]{24}$/),
  category: Joi.string().valid(...Object.values(CostCategory)).optional(),
  type: Joi.string().valid(...Object.values(CostType)).optional(),
  isActive: Joi.boolean().optional(),
});

export class QueryCostEntryDto {
  storeId: string;
  month?: string;
  category?: CostCategory;
  type?: CostType;
  templateId?: string;
  page?: number;
  size?: number;
}

export const QueryCostEntrySchema = Joi.object({
  storeId: Joi.string().required().regex(/^[0-9a-fA-F]{24}$/),
  month: Joi.string().optional().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  category: Joi.string().valid(...Object.values(CostCategory)).optional(),
  type: Joi.string().valid(...Object.values(CostType)).optional(),
  templateId: Joi.string().optional().regex(/^[0-9a-fA-F]{24}$/),
  page: Joi.number().integer().min(1).optional().default(1),
  size: Joi.number().integer().min(1).max(100).optional().default(50),
});

export class QueryMonthlySummaryDto {
  storeId: string;
  startMonth?: string;
  endMonth?: string;
  months?: number;
}

export const QueryMonthlySummarySchema = Joi.object({
  storeId: Joi.string().required().regex(/^[0-9a-fA-F]{24}$/),
  startMonth: Joi.string().optional().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  endMonth: Joi.string().optional().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  months: Joi.number().integer().min(1).max(24).optional().default(6),
});

// ========================
// Bulk Entry DTO
// ========================

export class BulkCreateEntriesDto {
  month: string;
  entries: Array<{
    templateId: string;
    amount?: number;
    paidAt?: string;
    notes?: string;
  }>;
}

export const BulkCreateEntriesSchema = Joi.object({
  month: Joi.string().required().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  entries: Joi.array().items(
    Joi.object({
      templateId: Joi.string().required().regex(/^[0-9a-fA-F]{24}$/),
      amount: Joi.number().min(0).optional(),
      paidAt: Joi.string().optional().isoDate(),
      notes: Joi.string().optional().trim().max(500).allow(''),
    }),
  ).min(1).required(),
});
