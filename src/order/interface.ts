import {
  OrderStatus,
  PaymentStatus,
  FulfillmentStatus,
  OrderSource,
} from './enum';
import { OrderItemStockStatus } from '../order-item/enum';

export interface IOrderAddress {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface IOrderLineItem {
  externalId: number;
  name: string;
  productId?: number;
  variationId?: number;
  localProductId?: string;
  localVariantId?: string;
  quantity: number;
  sku?: string;
  price: number;
  subtotal: string;
  subtotalTax: string;
  total: string;
  totalTax: string;
  taxClass?: string;
}

export interface IShippingLine {
  externalId: number;
  methodTitle: string;
  methodId: string;
  total: string;
  totalTax: string;
}

export interface IFeeLine {
  externalId: number;
  name: string;
  total: string;
  totalTax: string;
}

export interface ICouponLine {
  externalId: number;
  code: string;
  discount: string;
  discountTax: string;
}

export interface IOrderRefund {
  externalId: number;
  reason?: string;
  total: string;
  refundedAt: Date;
}

export interface IOrderNote {
  _id: string;
  content: string;
  isCustomerNote: boolean;
  addedBy?: string;
  addedByUserId?: string;
  createdAt: Date;
}

// Serialized order item for API responses
export interface IOrderItemSerialized {
  _id: string;
  storeId: string;
  orderId: string;
  productId?: string;
  variantId?: string;
  skuId?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  stockStatus: OrderItemStockStatus;
  fulfilledQuantity: number;
  returnedQuantity: number;
  attributes?: Record<string, any>;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IOrder {
  _id: string;
  storeId: string;
  externalId?: number;
  orderNumber: string;
  internalOrderNumber?: string;
  orderKey?: string;
  source?: OrderSource;
  useSeparateItems?: boolean;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  currencySymbol?: string;
  paidCurrency?: string;
  paidTotal?: string;
  conversionRate?: number;
  pricesIncludeTax?: boolean;
  discountTotal?: string;
  discountTax?: string;
  shippingTotal?: string;
  shippingTax?: string;
  cartTax?: string;
  total: string;
  totalTax?: string;
  // Calculated totals from OrderItems
  itemsCount?: number;
  itemsQuantity?: number;
  itemsSubtotal?: number;
  customerId?: number;
  localCustomerId?: string;
  customerNote?: string;
  billing: IOrderAddress;
  shipping: IOrderAddress;
  paymentMethod?: string;
  paymentMethodTitle?: string;
  transactionId?: string;
  datePaid?: Date;
  dateCompleted?: Date;
  // Manual order workflow timestamps
  confirmedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  createdByUserId?: string;
  lineItems: IOrderLineItem[];
  orderItems?: IOrderItemSerialized[]; // For manual orders with useSeparateItems
  shippingLines: IShippingLine[];
  feeLines: IFeeLine[];
  couponLines: ICouponLine[];
  refunds: IOrderRefund[];
  createdVia?: string;
  dateCreatedWoo?: Date;
  dateModifiedWoo?: Date;
  lastSyncedAt?: Date;
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingUrl?: string;
  internalNotes?: string;
  notes: IOrderNote[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderResponse {
  orders: IOrder[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface IOrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: Record<OrderStatus, number>;
  recentOrders: IOrder[];
}

export interface ICreateManualOrderDto {
  currency?: string;
  billing?: Partial<IOrderAddress>;
  shipping?: Partial<IOrderAddress>;
  shippingTotal?: string;
  customerId?: string;
  customerNote?: string;
  internalNotes?: string;
  paymentStatus?: PaymentStatus;
}
