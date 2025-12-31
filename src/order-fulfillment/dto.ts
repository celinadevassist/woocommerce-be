import * as Joi from 'joi';

// Assign units to line item
export class AssignUnitsDto {
  lineItemIndex: number;
  unitIds: string[];
}

export const AssignUnitsSchema = Joi.object({
  lineItemIndex: Joi.number().integer().min(0).required(),
  unitIds: Joi.array().items(Joi.string().required()).min(1).required(),
});

// Bulk assign units
export class BulkAssignDto {
  assignments: {
    lineItemIndex: number;
    unitIds: string[];
  }[];
}

export const BulkAssignSchema = Joi.object({
  assignments: Joi.array()
    .items(
      Joi.object({
        lineItemIndex: Joi.number().integer().min(0).required(),
        unitIds: Joi.array().items(Joi.string().required()).min(1).required(),
      }),
    )
    .min(1)
    .required(),
});

// Scan RFID for order
export class ScanRfidDto {
  rfidCode: string;
}

export const ScanRfidSchema = Joi.object({
  rfidCode: Joi.string().required(),
});

// Complete fulfillment
export class CompleteFulfillmentDto {
  notes?: string;
}

export const CompleteFulfillmentSchema = Joi.object({
  notes: Joi.string().optional(),
});

// Remove unit from fulfillment
export class RemoveUnitDto {
  unitId: string;
}

export const RemoveUnitSchema = Joi.object({
  unitId: Joi.string().required(),
});
