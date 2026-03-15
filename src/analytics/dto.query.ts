import * as Joi from 'joi';

export class QueryAnalyticsDto {
  storeId?: string;
  startDate?: string;
  endDate?: string;
  period?: 'day' | 'week' | 'month' | 'year';
}

export const QueryAnalyticsSchema = Joi.object({
  storeId: Joi.string().optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  period: Joi.string()
    .valid('day', 'week', 'month', 'year')
    .optional()
    .default('month'),
});

export class QueryProfitSummaryDto {
  storeId: string;
  period?: 'day' | 'week' | 'month' | 'year';
  months?: number;
}

export const QueryProfitSummarySchema = Joi.object({
  storeId: Joi.string().required(),
  period: Joi.string()
    .valid('day', 'week', 'month', 'year')
    .optional()
    .default('month'),
  months: Joi.number().integer().min(1).max(60).optional().default(12),
});
