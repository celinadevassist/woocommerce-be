import { Types } from 'mongoose';

// Suggested unit for fulfillment
export interface ISuggestedUnit {
  _id: Types.ObjectId;
  rfidCode: string;
  sku: string;
  productName: string;
  batchId: Types.ObjectId;
  batchNumber: string;
  unitCost: number;
  productionDate: Date;
  location?: string;
}

// Line item fulfillment suggestion
export interface ILineItemSuggestion {
  lineItemIndex: number;
  externalId: number;
  name: string;
  sku: string;
  quantityNeeded: number;
  quantityFulfilled: number;
  quantityPending: number;
  suggestedUnits: ISuggestedUnit[];
  fulfilledUnits: ISuggestedUnit[];
  isComplete: boolean;
}

// Order fulfillment status
export interface IFulfillmentStatus {
  orderId: Types.ObjectId;
  orderNumber: string;
  status: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled';
  totalItems: number;
  fulfilledItems: number;
  totalQuantity: number;
  fulfilledQuantity: number;
  lineItems: ILineItemSuggestion[];
}

// RFID scan result
export interface IScanResult {
  success: boolean;
  message: string;
  unit?: ISuggestedUnit;
  assignedToLineItem?: number;
  lineItemName?: string;
}

// Fulfillment assignment request
export interface IAssignmentRequest {
  lineItemIndex: number;
  unitIds: string[];
}

// Fulfillment completion result
export interface ICompletionResult {
  success: boolean;
  orderNumber: string;
  totalUnitsMarkedAsSold: number;
  newFulfillmentStatus: string;
}
