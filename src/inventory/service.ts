import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InventoryLog,
  InventoryLogDocument,
  StockAlert,
  StockAlertDocument,
} from './schema';
import { InventoryChangeType, AlertType, AlertStatus } from './enum';
import {
  IInventoryLog,
  IStockAlert,
  IInventoryOverview,
  IInventoryLogsResponse,
  IStockAlertsResponse,
} from './interface';
import { Product, ProductDocument } from '../product/schema';
import {
  ProductVariant,
  ProductVariantDocument,
} from '../product/variant.schema';
import { Store, StoreDocument } from '../store/schema';
import { StockStatus } from '../product/enum';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryLog.name)
    private inventoryLogModel: Model<InventoryLogDocument>,
    @InjectModel(StockAlert.name)
    private stockAlertModel: Model<StockAlertDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(ProductVariant.name)
    private variantModel: Model<ProductVariantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  /**
   * Log a stock change
   */
  async logStockChange(
    productId: string,
    previousQuantity: number,
    newQuantity: number,
    changeType: InventoryChangeType,
    options: {
      variantId?: string;
      reason?: string;
      reference?: string;
      changedBy?: string;
    } = {},
  ): Promise<IInventoryLog> {
    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const log = await this.inventoryLogModel.create({
      productId: new Types.ObjectId(productId),
      variantId: options.variantId
        ? new Types.ObjectId(options.variantId)
        : undefined,
      storeId: product.storeId,
      previousQuantity,
      newQuantity,
      quantityChange: newQuantity - previousQuantity,
      changeType,
      reason: options.reason,
      reference: options.reference,
      changedBy: options.changedBy
        ? new Types.ObjectId(options.changedBy)
        : undefined,
      sku: product.sku,
      productName: product.name,
    });

    // Check and create/update alerts
    await this.checkAndUpdateAlerts(product, newQuantity);

    return this.toLogInterface(log);
  }

  /**
   * Get inventory logs for a product or store
   */
  async getLogs(
    userId: string,
    options: {
      productId?: string;
      storeId?: string;
      changeType?: InventoryChangeType;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      size?: number;
    } = {},
  ): Promise<IInventoryLogsResponse> {
    // Get user's accessible stores
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
    };

    if (options.productId) {
      filter.productId = new Types.ObjectId(options.productId);
    }
    if (options.storeId) {
      // Verify user has access to this specific store
      await this.getStoreWithAccess(options.storeId, userId);
      filter.storeId = new Types.ObjectId(options.storeId);
    }
    if (options.changeType) {
      filter.changeType = options.changeType;
    }
    if (options.startDate || options.endDate) {
      filter.createdAt = {};
      if (options.startDate) filter.createdAt.$gte = options.startDate;
      if (options.endDate) filter.createdAt.$lte = options.endDate;
    }

    const page = options.page || 1;
    const size = options.size || 20;
    const skip = (page - 1) * size;

    const [logs, total] = await Promise.all([
      this.inventoryLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size),
      this.inventoryLogModel.countDocuments(filter),
    ]);

    return {
      logs: logs.map((log) => this.toLogInterface(log)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Export inventory logs to CSV
   */
  async exportToCsv(
    userId: string,
    options: {
      productId?: string;
      storeId?: string;
      changeType?: InventoryChangeType;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<string> {
    // Get user's accessible stores
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
    };

    if (options.productId) {
      filter.productId = new Types.ObjectId(options.productId);
    }
    if (options.storeId) {
      // Verify user has access to this specific store
      await this.getStoreWithAccess(options.storeId, userId);
      filter.storeId = new Types.ObjectId(options.storeId);
    }
    if (options.changeType) {
      filter.changeType = options.changeType;
    }
    if (options.startDate || options.endDate) {
      filter.createdAt = {};
      if (options.startDate) filter.createdAt.$gte = options.startDate;
      if (options.endDate) filter.createdAt.$lte = options.endDate;
    }

    const logs = await this.inventoryLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(10000); // Max 10k logs

    // CSV Header
    const headers = [
      'Date',
      'Product Name',
      'SKU',
      'Change Type',
      'Previous Quantity',
      'New Quantity',
      'Quantity Change',
      'Reason',
      'Reference',
      'Changed By',
    ];

    // CSV Rows
    const rows = logs.map((log) => {
      return [
        log.createdAt
          ? new Date(log.createdAt).toISOString().split('T')[0]
          : '',
        log.productName || '',
        log.sku || '',
        log.changeType || '',
        log.previousQuantity || 0,
        log.newQuantity || 0,
        log.quantityChange || 0,
        log.reason || '',
        log.reference || '',
        log.changedBy ? log.changedBy.toString() : '',
      ];
    });

    // Escape CSV values
    const escapeValue = (val: any): string => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV with UTF-8 BOM for Arabic text support
    const BOM = '\uFEFF';
    const csvContent =
      BOM +
      [
        headers.map(escapeValue).join(','),
        ...rows.map((row) => row.map(escapeValue).join(',')),
      ].join('\n');

    return csvContent;
  }

  /**
   * Get stock alerts
   */
  async getAlerts(
    userId: string,
    options: {
      storeId?: string;
      status?: AlertStatus;
      alertType?: AlertType;
      page?: number;
      size?: number;
    } = {},
  ): Promise<IStockAlertsResponse> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
    };

    if (options.storeId) {
      // Verify user has access to this specific store
      await this.getStoreWithAccess(options.storeId, userId);
      filter.storeId = new Types.ObjectId(options.storeId);
    }
    if (options.status) {
      filter.status = options.status;
    } else {
      filter.status = AlertStatus.ACTIVE; // Default to active alerts
    }
    if (options.alertType) {
      filter.alertType = options.alertType;
    }

    const page = options.page || 1;
    const size = options.size || 20;
    const skip = (page - 1) * size;

    const [alerts, total] = await Promise.all([
      this.stockAlertModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size),
      this.stockAlertModel.countDocuments(filter),
    ]);

    return {
      alerts: alerts.map((alert) => this.toAlertInterface(alert)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get inventory overview for a store
   */
  async getOverview(
    userId: string,
    storeId?: string,
  ): Promise<IInventoryOverview> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      // Verify user has access to this specific store
      await this.getStoreWithAccess(storeId, userId);
      filter.storeId = new Types.ObjectId(storeId);
    }

    const [totalProducts, inStockCount, outOfStockCount, lowStockCount] =
      await Promise.all([
        this.productModel.countDocuments(filter),
        this.productModel.countDocuments({
          ...filter,
          stockStatus: StockStatus.IN_STOCK,
        }),
        this.productModel.countDocuments({
          ...filter,
          stockStatus: StockStatus.OUT_OF_STOCK,
        }),
        this.productModel.countDocuments({
          ...filter,
          manageStock: true,
          stockQuantity: { $ne: null },
          $expr: {
            $lte: ['$stockQuantity', { $ifNull: ['$lowStockAmount', 10] }],
          },
        }),
      ]);

    return {
      totalProducts,
      totalInStock: inStockCount,
      totalOutOfStock: outOfStockCount,
      totalLowStock: lowStockCount,
    };
  }

  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId: string, userId: string): Promise<IStockAlert> {
    const alert = await this.stockAlertModel.findById(alertId);
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    // Verify user has access to the store
    await this.getStoreWithAccess(alert.storeId.toString(), userId);

    alert.status = AlertStatus.DISMISSED;
    (alert as any).dismissedBy = new Types.ObjectId(userId);
    await alert.save();

    return this.toAlertInterface(alert);
  }

  /**
   * Get alert count for dashboard
   */
  async getAlertCount(
    userId: string,
    storeId?: string,
  ): Promise<{ lowStock: number; outOfStock: number }> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      status: AlertStatus.ACTIVE,
    };

    if (storeId) {
      // Verify user has access to this specific store
      await this.getStoreWithAccess(storeId, userId);
      filter.storeId = new Types.ObjectId(storeId);
    }

    const [lowStockCount, outOfStockCount] = await Promise.all([
      this.stockAlertModel.countDocuments({
        ...filter,
        alertType: AlertType.LOW_STOCK,
      }),
      this.stockAlertModel.countDocuments({
        ...filter,
        alertType: AlertType.OUT_OF_STOCK,
      }),
    ]);

    return {
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
    };
  }

  // Private helper methods
  private async checkAndUpdateAlerts(
    product: ProductDocument,
    quantity: number,
  ): Promise<void> {
    const threshold = product.lowStockAmount || 10;
    const store = await this.storeModel.findById(product.storeId);
    const storeThreshold = store?.settings?.lowStockThreshold || threshold;
    const effectiveThreshold = product.lowStockAmount || storeThreshold;

    // Determine alert type based on quantity
    let alertType: AlertType | null = null;

    if (quantity === 0) {
      alertType = AlertType.OUT_OF_STOCK;
    } else if (quantity <= effectiveThreshold) {
      alertType = AlertType.LOW_STOCK;
    }

    // Find existing active alert
    const existingAlert = await this.stockAlertModel.findOne({
      productId: product._id,
      status: AlertStatus.ACTIVE,
    });

    if (alertType) {
      // Create or update alert
      if (existingAlert) {
        existingAlert.alertType = alertType;
        existingAlert.currentQuantity = quantity;
        existingAlert.threshold = effectiveThreshold;
        await existingAlert.save();
      } else {
        await this.stockAlertModel.create({
          productId: product._id,
          storeId: product.storeId,
          alertType,
          status: AlertStatus.ACTIVE,
          currentQuantity: quantity,
          threshold: effectiveThreshold,
          sku: product.sku,
          productName: product.name,
        });
      }
    } else if (existingAlert) {
      // Resolve the alert - stock is back to healthy levels
      existingAlert.status = AlertStatus.RESOLVED;
      existingAlert.resolvedAt = new Date();
      await existingAlert.save();

      // Create a "back in stock" notification if it was out of stock
      if (existingAlert.alertType === AlertType.OUT_OF_STOCK) {
        await this.stockAlertModel.create({
          productId: product._id,
          storeId: product.storeId,
          alertType: AlertType.BACK_IN_STOCK,
          status: AlertStatus.RESOLVED, // Auto-resolve back-in-stock alerts
          currentQuantity: quantity,
          sku: product.sku,
          productName: product.name,
          resolvedAt: new Date(),
        });
      }
    }
  }

  private async getUserStoreIds(userId: string): Promise<Types.ObjectId[]> {
    const stores = await this.storeModel.find({
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });
    return stores.map((store) => store._id);
  }

  private async getStoreWithAccess(
    storeId: string,
    userId: string,
  ): Promise<StoreDocument> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const isOwner = store.ownerId?.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  private toLogInterface(doc: InventoryLogDocument): IInventoryLog {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      productId: obj.productId.toString(),
      variantId: obj.variantId?.toString(),
      storeId: obj.storeId.toString(),
      previousQuantity: obj.previousQuantity,
      newQuantity: obj.newQuantity,
      quantityChange: obj.quantityChange,
      changeType: obj.changeType,
      reason: obj.reason,
      reference: obj.reference,
      changedBy: obj.changedBy?.toString(),
      sku: obj.sku,
      productName: obj.productName,
      createdAt: obj.createdAt,
    };
  }

  private toAlertInterface(doc: StockAlertDocument): IStockAlert {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      productId: obj.productId.toString(),
      variantId: obj.variantId?.toString(),
      storeId: obj.storeId.toString(),
      alertType: obj.alertType,
      status: obj.status,
      currentQuantity: obj.currentQuantity,
      threshold: obj.threshold,
      sku: obj.sku,
      productName: obj.productName,
      resolvedAt: obj.resolvedAt,
      dismissedBy: obj.dismissedBy?.toString(),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
