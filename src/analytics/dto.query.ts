import * as Joi from 'joi';

export class QueryAnalyticsDto {
  storeId?: string;
  organizationId?: string;
  startDate?: string;
  endDate?: string;
  period?: 'day' | 'week' | 'month' | 'year';
}

export const QueryAnalyticsSchema = Joi.object({
  storeId: Joi.string().optional(),
  organizationId: Joi.string().optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  period: Joi.string().valid('day', 'week', 'month', 'year').optional().default('month'),
});
