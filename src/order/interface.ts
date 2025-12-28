import { OrderStatus, PaymentStatus, FulfillmentStatus } from './enum';

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

export interface IOrder {
  _id: string;
  storeId: string;
  organizationId: string;
  externalId: number;
  orderNumber: string;
  orderKey?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  currencySymbol?: string;
  pricesIncludeTax: boolean;
  discountTotal: string;
  discountTax: string;
  shippingTotal: string;
  shippingTax: string;
  cartTax: string;
  total: string;
  totalTax: string;
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
  lineItems: IOrderLineItem[];
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
