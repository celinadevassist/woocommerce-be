import * as Joi from 'joi';

// Update DTOs for Admin endpoints

export class AdminUpdateUserDTO {
  role?: string;
  notes?: string;
}

export const AdminUpdateUserSchema = Joi.object({
  role: Joi.string().valid('admin', 'user').optional(),
  notes: Joi.string().optional().allow(''),
});

export class AdminSuspendStoreDTO {
  reason: string;
}

export const AdminSuspendStoreSchema = Joi.object({
  reason: Joi.string().required().min(3).max(500),
});

export class AdminUpdateSubscriptionDTO {
  status?: string;
  plan?: string;
  pricePerMonth?: number;
  currency?: string;
  billingCycle?: string;
  discount?: number;
  trialEndsAt?: Date;
  notes?: string;
}

export const AdminUpdateSubscriptionSchema = Joi.object({
  status: Joi.string()
    .valid('active', 'suspended', 'cancelled', 'trial')
    .optional(),
  plan: Joi.string().optional().allow(''),
  pricePerMonth: Joi.number().min(0).optional(),
  currency: Joi.string().optional(),
  billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').optional(),
  discount: Joi.number().min(0).max(100).optional(),
  trialEndsAt: Joi.date().iso().optional().allow(null),
  notes: Joi.string().optional().allow(''),
});

export class AdminCancelSubscriptionDTO {
  reason: string;
}

export const AdminCancelSubscriptionSchema = Joi.object({
  reason: Joi.string().required().min(3).max(500),
});

export class AdminMarkInvoicePaidDTO {
  paymentMethod: string;
  paymentReference?: string;
  notes?: string;
}

export const AdminMarkInvoicePaidSchema = Joi.object({
  paymentMethod: Joi.string().required(),
  paymentReference: Joi.string().optional().allow(''),
  notes: Joi.string().optional().allow(''),
});

export class AdminCancelInvoiceDTO {
  reason: string;
}

export const AdminCancelInvoiceSchema = Joi.object({
  reason: Joi.string().required().min(3).max(500),
});

// Create subscription for store without one
export class AdminCreateSubscriptionDTO {
  plan?: string;
  pricePerMonth: number;
  currency?: string;
  billingCycle?: string;
  trialDays?: number;
}

export const AdminCreateSubscriptionSchema = Joi.object({
  plan: Joi.string().optional().default('standard'),
  pricePerMonth: Joi.number().required().min(0),
  currency: Joi.string().optional().default('USD'),
  billingCycle: Joi.string()
    .valid('monthly', 'yearly')
    .optional()
    .default('monthly'),
  trialDays: Joi.number().optional().min(0).default(0),
});

// Generate invoice for store
export class AdminGenerateInvoiceDTO {
  amount: number;
  description?: string;
  dueInDays?: number;
}

export const AdminGenerateInvoiceSchema = Joi.object({
  amount: Joi.number().required().min(0),
  description: Joi.string().optional().allow(''),
  dueInDays: Joi.number().optional().min(1).default(30),
});
