import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { StockTransactionType, StockStatus } from './enum';

// Product Stock schema
@Schema({ timestamps: true, collection: 'product_stock' })
export class ProductStock extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', index: true })
  productId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Variant' })
  variantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SKU' })
  skuId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  sku: string;

  @Prop({ type: String, required: true })
  productName: string;

  @Prop({ type: String })
  variantName: string;

  @Prop({ type: Number, default: 0 })
  currentStock: number;

  @Prop({ type: Number, default: 0 })
  reservedStock: number;

  @Prop({ type: Number, default: 0 })
  availableStock: number;

  @Prop({ type: Number, default: 0 })
  minStockLevel: number;

  @Prop({ type: Number, default: 0 })
  reorderPoint: number;

  @Prop({ type: Number, default: 0 })
  reorderQuantity: number;

  @Prop({ type: Number, default: 0 })
  unitCost: number;

  @Prop({ type: Number, default: 0 })
  totalValue: number;

  @Prop({ type: String, enum: Object.values(StockStatus), default: StockStatus.OUT_OF_STOCK })
  status: StockStatus;

  @Prop({ type: String })
  location: string;

  @Prop({ type: Date })
  lastRestockedAt: Date;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const ProductStockSchema = SchemaFactory.createForClass(ProductStock);

// Compound unique index for product/variant per store
ProductStockSchema.index({ storeId: 1, sku: 1 }, { unique: true });

// Index for status queries
ProductStockSchema.index({ storeId: 1, status: 1 });

// Index for low stock alerts
ProductStockSchema.index({ storeId: 1, currentStock: 1, minStockLevel: 1 });

// Stock Transaction schema
@Schema({ timestamps: true, collection: 'stock_transactions' })
export class StockTransaction extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProductStock', required: true, index: true })
  stockId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(StockTransactionType), required: true })
  type: StockTransactionType;

  @Prop({ type: Number, required: true })
  quantity: number;

  @Prop({ type: Number, required: true })
  previousStock: number;

  @Prop({ type: Number, required: true })
  newStock: number;

  @Prop({ type: Number })
  unitCost: number;

  @Prop({ type: Number })
  totalCost: number;

  @Prop({ type: String })
  reference: string;

  @Prop({ type: String })
  referenceType: string;

  @Prop({ type: String })
  notes: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  performedBy: MongooseSchema.Types.ObjectId;
}

export const StockTransactionSchema = SchemaFactory.createForClass(StockTransaction);

// Index for transaction history queries
StockTransactionSchema.index({ stockId: 1, createdAt: -1 });
StockTransactionSchema.index({ storeId: 1, createdAt: -1 });
