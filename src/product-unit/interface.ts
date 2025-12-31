import { Types } from 'mongoose';
import { ProductUnitStatus } from './enum';

export interface IProductUnit {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  rfidCode: string;
  skuId: Types.ObjectId;
  sku: string;
  productName: string;
  batchId: Types.ObjectId;
  batchNumber: string;
  unitCost: number;
  status: ProductUnitStatus;
  location?: string;
  orderId?: Types.ObjectId;
  orderNumber?: string;
  reservedAt?: Date;
  soldAt?: Date;
  productionDate: Date;
  notes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductUnitResponse extends IProductUnit {
  skuDefinition?: {
    _id: Types.ObjectId;
    sku: string;
    title: string;
  };
  batch?: {
    _id: Types.ObjectId;
    batchNumber: string;
    completedDate: Date;
  };
  order?: {
    _id: Types.ObjectId;
    orderNumber: string;
    customerName: string;
  };
}

export interface IProductUnitCountsByStatus {
  in_stock: number;
  reserved: number;
  sold: number;
  damaged: number;
  returned: number;
  transferred: number;
  total: number;
}

export interface IProductUnitListResponse {
  units: IProductUnit[];
  total: number;
  page: number;
  pages: number;
}

export interface IBulkCreateResult {
  created: number;
  rfidCodes: string[];
}
