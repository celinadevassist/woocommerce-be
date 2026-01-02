import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductStock, StockTransaction } from './schema';
import { Store } from '../store/schema';
import { ProductUnit } from '../product-unit/schema';
import { ProductUnitStatus } from '../product-unit/enum';
import { StockTransactionType, StockStatus } from './enum';
import { IProductStock, IProductStockResponse, IStockSummary, ITransactionResponse, IStockAuditResult, IStockAuditItem } from './interface';
import {
  CreateProductStockDto,
  UpdateProductStockDto,
  AddStockDto,
  DeductStockDto,
  AdjustStockDto,
  ReserveStockDto,
  QueryProductStockDto,
  QueryTransactionsDto,
} from './dto';

@Injectable()
export class ProductStockService {
  private readonly logger = new Logger(ProductStockService.name);

  constructor(
    @InjectModel(ProductStock.name) private stockModel: Model<ProductStock>,
    @InjectModel(StockTransaction.name) private transactionModel: Model<StockTransaction>,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    @InjectModel(ProductUnit.name) private unitModel: Model<ProductUnit>,
  ) {}

  /**
   * Convert document to interface
   */
  private toInterface(doc: ProductStock): IProductStock {
    return {
      _id: doc._id as any,
      storeId: doc.storeId as any,
      productId: doc.productId as any,
      variantId: doc.variantId as any,
      skuId: doc.skuId as any,
      sku: doc.sku,
      productName: doc.productName,
      variantName: doc.variantName,
      currentStock: doc.currentStock,
      reservedStock: doc.reservedStock,
      availableStock: doc.availableStock,
      minStockLevel: doc.minStockLevel,
      reorderPoint: doc.reorderPoint,
      reorderQuantity: doc.reorderQuantity,
      unitCost: doc.unitCost,
      totalValue: doc.totalValue,
      status: doc.status,
      location: doc.location,
      lastRestockedAt: doc.lastRestockedAt,
      hasUnitTracking: doc.hasUnitTracking || false,
      unitCount: doc.unitCount || 0,
      isDeleted: doc.isDeleted,
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    };
  }

  /**
   * Update stock status based on current stock level
   */
  private calculateStatus(currentStock: number, minStockLevel: number): StockStatus {
    if (currentStock <= 0) return StockStatus.OUT_OF_STOCK;
    if (currentStock <= minStockLevel) return StockStatus.LOW_STOCK;
    return StockStatus.IN_STOCK;
  }

  /**
   * Update calculated fields
   */
  private async updateCalculatedFields(stock: ProductStock): Promise<void> {
    stock.availableStock = Math.max(0, stock.currentStock - stock.reservedStock);
    stock.totalValue = stock.currentStock * stock.unitCost;
    stock.status = this.calculateStatus(stock.currentStock, stock.minStockLevel);
  }

  /**
   * Verify store access
   */
  private async getStoreWithAccess(storeId: string, userId: string): Promise<any> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    });

    if (!store) {
      throw new NotFoundException('Store not found or access denied');
    }

    return store;
  }

  /**
   * Create product stock entry
   */
  async create(storeId: string, userId: string, dto: CreateProductStockDto): Promise<IProductStock> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);

    // Check if SKU already exists for this store
    const existing = await this.stockModel.findOne({
      storeId: storeObjectId,
      sku: dto.sku,
      isDeleted: false,
    });

    if (existing) {
      throw new ConflictException(`Stock entry for SKU "${dto.sku}" already exists`);
    }

    const stock = await this.stockModel.create({
      storeId: storeObjectId,
      productId: dto.productId ? new Types.ObjectId(dto.productId) : undefined,
      variantId: dto.variantId ? new Types.ObjectId(dto.variantId) : undefined,
      skuId: dto.skuId ? new Types.ObjectId(dto.skuId) : undefined,
      sku: dto.sku,
      productName: dto.productName,
      variantName: dto.variantName || '',
      currentStock: dto.currentStock || 0,
      reservedStock: 0,
      availableStock: dto.currentStock || 0,
      minStockLevel: dto.minStockLevel || 0,
      reorderPoint: dto.reorderPoint || 0,
      reorderQuantity: dto.reorderQuantity || 0,
      unitCost: dto.unitCost || 0,
      totalValue: (dto.currentStock || 0) * (dto.unitCost || 0),
      status: this.calculateStatus(dto.currentStock || 0, dto.minStockLevel || 0),
      location: dto.location || '',
    });

    // Create initial transaction if stock > 0
    if (dto.currentStock && dto.currentStock > 0) {
      await this.transactionModel.create({
        storeId: storeObjectId,
        stockId: stock._id,
        type: StockTransactionType.INITIAL,
        quantity: dto.currentStock,
        previousStock: 0,
        newStock: dto.currentStock,
        unitCost: dto.unitCost || 0,
        totalCost: dto.currentStock * (dto.unitCost || 0),
        notes: 'Initial stock setup',
        performedBy: new Types.ObjectId(userId),
      });
    }

    this.logger.log(`Product stock created: ${dto.sku}`);
    return this.toInterface(stock);
  }

  /**
   * Find all stock for a store with filters
   */
  async findByStore(userId: string, query: QueryProductStockDto): Promise<{ data: IProductStock[]; total: number; page: number; pages: number }> {
    if (!query.storeId) {
      throw new BadRequestException('storeId is required');
    }

    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.lowStock) {
      filter.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
    }

    if (query.keyword) {
      filter.$or = [
        { sku: { $regex: query.keyword, $options: 'i' } },
        { productName: { $regex: query.keyword, $options: 'i' } },
        { variantName: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    if (query.location) {
      filter.location = query.location;
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const [stocks, total] = await Promise.all([
      this.stockModel.find(filter).sort({ productName: 1 }).skip(skip).limit(size),
      this.stockModel.countDocuments(filter),
    ]);

    return {
      data: stocks.map(s => this.toInterface(s)),
      total,
      page,
      pages: Math.ceil(total / size),
    };
  }

  /**
   * Get stock by ID
   */
  async findById(userId: string, stockId: string): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    return this.toInterface(stock);
  }

  /**
   * Get stock by SKU
   */
  async findBySku(userId: string, storeId: string, sku: string): Promise<IProductStock> {
    await this.getStoreWithAccess(storeId, userId);

    const stock = await this.stockModel.findOne({
      storeId: new Types.ObjectId(storeId),
      sku,
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException(`Stock entry for SKU "${sku}" not found`);
    }

    return this.toInterface(stock);
  }

  /**
   * Update stock settings
   */
  async update(userId: string, stockId: string, dto: UpdateProductStockDto): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    if (dto.productName !== undefined) stock.productName = dto.productName;
    if (dto.variantName !== undefined) stock.variantName = dto.variantName;
    if (dto.minStockLevel !== undefined) stock.minStockLevel = dto.minStockLevel;
    if (dto.reorderPoint !== undefined) stock.reorderPoint = dto.reorderPoint;
    if (dto.reorderQuantity !== undefined) stock.reorderQuantity = dto.reorderQuantity;
    if (dto.unitCost !== undefined) stock.unitCost = dto.unitCost;
    if (dto.location !== undefined) stock.location = dto.location;

    await this.updateCalculatedFields(stock);
    await stock.save();

    this.logger.log(`Stock updated: ${stock.sku}`);
    return this.toInterface(stock);
  }

  /**
   * Add stock (from production, purchase, return)
   */
  async addStock(userId: string, stockId: string, dto: AddStockDto): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    const previousStock = stock.currentStock;
    const newStock = previousStock + dto.quantity;

    // Update unit cost if provided (weighted average)
    if (dto.unitCost !== undefined && dto.unitCost > 0) {
      const totalValue = previousStock * stock.unitCost + dto.quantity * dto.unitCost;
      stock.unitCost = newStock > 0 ? Math.round((totalValue / newStock) * 100) / 100 : dto.unitCost;
    }

    stock.currentStock = newStock;
    stock.lastRestockedAt = new Date();
    await this.updateCalculatedFields(stock);
    await stock.save();

    // Create transaction
    await this.transactionModel.create({
      storeId: stock.storeId,
      stockId: stock._id,
      type: dto.referenceType === 'production' ? StockTransactionType.PRODUCTION :
            dto.referenceType === 'return' ? StockTransactionType.RETURN : StockTransactionType.ADJUSTMENT,
      quantity: dto.quantity,
      previousStock,
      newStock,
      unitCost: dto.unitCost,
      totalCost: dto.quantity * (dto.unitCost || stock.unitCost),
      reference: dto.reference || '',
      referenceType: dto.referenceType || 'manual',
      notes: dto.notes || '',
      performedBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Stock added to ${stock.sku}: +${dto.quantity}`);
    return this.toInterface(stock);
  }

  /**
   * Deduct stock (for sales, damage, transfer)
   */
  async deductStock(userId: string, stockId: string, dto: DeductStockDto): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    const previousStock = stock.currentStock;
    const newStock = previousStock - dto.quantity;

    if (newStock < 0) {
      throw new BadRequestException(`Insufficient stock. Current: ${previousStock}, Requested: ${dto.quantity}`);
    }

    stock.currentStock = newStock;
    await this.updateCalculatedFields(stock);
    await stock.save();

    // Create transaction
    await this.transactionModel.create({
      storeId: stock.storeId,
      stockId: stock._id,
      type: dto.type,
      quantity: -dto.quantity,
      previousStock,
      newStock,
      totalCost: dto.quantity * stock.unitCost,
      reference: dto.reference || '',
      referenceType: dto.referenceType || 'manual',
      notes: dto.notes || '',
      performedBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Stock deducted from ${stock.sku}: -${dto.quantity} (${dto.type})`);
    return this.toInterface(stock);
  }

  /**
   * Adjust stock to specific value
   */
  async adjustStock(userId: string, stockId: string, dto: AdjustStockDto): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    const previousStock = stock.currentStock;
    const difference = dto.newStock - previousStock;

    stock.currentStock = dto.newStock;
    if (difference > 0) {
      stock.lastRestockedAt = new Date();
    }
    await this.updateCalculatedFields(stock);
    await stock.save();

    // Create transaction
    await this.transactionModel.create({
      storeId: stock.storeId,
      stockId: stock._id,
      type: StockTransactionType.ADJUSTMENT,
      quantity: difference,
      previousStock,
      newStock: dto.newStock,
      totalCost: Math.abs(difference) * stock.unitCost,
      notes: dto.notes || 'Manual adjustment',
      performedBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Stock adjusted for ${stock.sku}: ${previousStock} → ${dto.newStock}`);
    return this.toInterface(stock);
  }

  /**
   * Reserve stock for pending orders
   */
  async reserveStock(userId: string, stockId: string, dto: ReserveStockDto): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    const newReserved = stock.reservedStock + dto.quantity;
    const newAvailable = stock.currentStock - newReserved;

    if (newAvailable < 0) {
      throw new BadRequestException(`Insufficient available stock. Available: ${stock.availableStock}, Requested: ${dto.quantity}`);
    }

    stock.reservedStock = newReserved;
    await this.updateCalculatedFields(stock);
    await stock.save();

    this.logger.log(`Stock reserved for ${stock.sku}: ${dto.quantity} (Order: ${dto.orderId || 'N/A'})`);
    return this.toInterface(stock);
  }

  /**
   * Release reserved stock
   */
  async releaseReservedStock(userId: string, stockId: string, quantity: number): Promise<IProductStock> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    stock.reservedStock = Math.max(0, stock.reservedStock - quantity);
    await this.updateCalculatedFields(stock);
    await stock.save();

    this.logger.log(`Reserved stock released for ${stock.sku}: ${quantity}`);
    return this.toInterface(stock);
  }

  /**
   * Delete stock entry
   */
  async delete(userId: string, stockId: string): Promise<void> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    if (stock.currentStock > 0) {
      throw new ConflictException('Cannot delete stock entry with existing stock. Adjust to zero first.');
    }

    stock.isDeleted = true;
    await stock.save();

    this.logger.log(`Stock entry deleted: ${stock.sku}`);
  }

  /**
   * Get transaction history for a stock entry
   */
  async getTransactions(userId: string, stockId: string, query: QueryTransactionsDto): Promise<ITransactionResponse> {
    const stock = await this.stockModel.findOne({
      _id: new Types.ObjectId(stockId),
      isDeleted: false,
    });

    if (!stock) {
      throw new NotFoundException('Stock entry not found');
    }

    await this.getStoreWithAccess(stock.storeId.toString(), userId);

    const filter: any = { stockId: stock._id };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const size = query.size || 50;
    const skip = (page - 1) * size;

    const [transactions, total] = await Promise.all([
      this.transactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(size),
      this.transactionModel.countDocuments(filter),
    ]);

    return {
      transactions: transactions as any,
      total,
      page,
      pages: Math.ceil(total / size),
    };
  }

  /**
   * Get stock summary for dashboard
   */
  async getSummary(userId: string, storeId: string): Promise<IStockSummary> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);

    const [totals, byStatus] = await Promise.all([
      this.stockModel.aggregate([
        { $match: { storeId: storeObjectId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalUnits: { $sum: '$currentStock' },
            totalValue: { $sum: '$totalValue' },
          },
        },
      ]),
      this.stockModel.aggregate([
        { $match: { storeId: storeObjectId, isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = byStatus.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalProducts: totals[0]?.totalProducts || 0,
      totalUnits: totals[0]?.totalUnits || 0,
      totalValue: totals[0]?.totalValue || 0,
      inStock: statusMap[StockStatus.IN_STOCK] || 0,
      lowStock: statusMap[StockStatus.LOW_STOCK] || 0,
      outOfStock: statusMap[StockStatus.OUT_OF_STOCK] || 0,
    };
  }

  /**
   * Get low stock items
   */
  async getLowStock(userId: string, storeId: string): Promise<IProductStock[]> {
    await this.getStoreWithAccess(storeId, userId);

    const stocks = await this.stockModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      $or: [
        { status: StockStatus.LOW_STOCK },
        { status: StockStatus.OUT_OF_STOCK },
      ],
    }).sort({ status: 1, currentStock: 1 }).limit(50);

    return stocks.map(s => this.toInterface(s));
  }

  /**
   * Get unique locations
   */
  async getLocations(userId: string, storeId: string): Promise<string[]> {
    await this.getStoreWithAccess(storeId, userId);

    const locations = await this.stockModel.distinct('location', {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      location: { $ne: '' },
    });

    return locations;
  }

  /**
   * Add stock from production - finds or creates stock entry for SKU
   * Used when production batches are completed
   */
  async addStockFromProduction(
    storeId: string,
    userId: string,
    skuId: string,
    skuCode: string,
    productName: string,
    quantity: number,
    unitCost: number,
    batchNumber: string,
  ): Promise<IProductStock> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);
    const skuObjectId = new Types.ObjectId(skuId);

    // Find existing stock entry for this SKU
    let stock = await this.stockModel.findOne({
      storeId: storeObjectId,
      skuId: skuObjectId,
      isDeleted: false,
    });

    if (stock) {
      // Add to existing stock using weighted average cost
      const previousStock = stock.currentStock;
      const newStock = previousStock + quantity;

      // Weighted average cost calculation
      if (unitCost > 0) {
        const totalValue = previousStock * stock.unitCost + quantity * unitCost;
        stock.unitCost = newStock > 0 ? Math.round((totalValue / newStock) * 100) / 100 : unitCost;
      }

      stock.currentStock = newStock;
      stock.lastRestockedAt = new Date();
      stock.hasUnitTracking = true;
      stock.unitCount = (stock.unitCount || 0) + quantity;
      await this.updateCalculatedFields(stock);
      await stock.save();

      // Create transaction record
      await this.transactionModel.create({
        storeId: storeObjectId,
        stockId: stock._id,
        type: StockTransactionType.PRODUCTION,
        quantity: quantity,
        previousStock,
        newStock,
        unitCost,
        totalCost: quantity * unitCost,
        reference: batchNumber,
        referenceType: 'production',
        notes: `Production batch: ${batchNumber}`,
        performedBy: new Types.ObjectId(userId),
      });

      this.logger.log(`Stock added from production to ${skuCode}: +${quantity} (Batch: ${batchNumber})`);
      return this.toInterface(stock);
    } else {
      // Create new stock entry
      stock = await this.stockModel.create({
        storeId: storeObjectId,
        skuId: skuObjectId,
        sku: skuCode,
        productName,
        variantName: '',
        currentStock: quantity,
        reservedStock: 0,
        availableStock: quantity,
        minStockLevel: 0,
        reorderPoint: 0,
        reorderQuantity: 0,
        unitCost,
        totalValue: quantity * unitCost,
        status: this.calculateStatus(quantity, 0),
        location: '',
        lastRestockedAt: new Date(),
        hasUnitTracking: true,
        unitCount: quantity,
      });

      // Create initial transaction
      await this.transactionModel.create({
        storeId: storeObjectId,
        stockId: stock._id,
        type: StockTransactionType.PRODUCTION,
        quantity,
        previousStock: 0,
        newStock: quantity,
        unitCost,
        totalCost: quantity * unitCost,
        reference: batchNumber,
        referenceType: 'production',
        notes: `Initial stock from production batch: ${batchNumber}`,
        performedBy: new Types.ObjectId(userId),
      });

      this.logger.log(`Stock created from production for ${skuCode}: ${quantity} units (Batch: ${batchNumber})`);
      return this.toInterface(stock);
    }
  }

  /**
   * Sync stock from Product Unit counts
   * Called when unit status changes (sold, damaged)
   * Only used for SKUs with unit tracking enabled
   */
  async syncFromUnits(storeId: string, skuId: string, inStockCount: number): Promise<void> {
    const stock = await this.stockModel.findOne({
      storeId: new Types.ObjectId(storeId),
      skuId: new Types.ObjectId(skuId),
      isDeleted: false,
    });

    if (!stock) {
      this.logger.warn(`Cannot sync stock - no stock entry found for SKU ${skuId}`);
      return;
    }

    // Only sync if unit tracking is enabled
    if (!stock.hasUnitTracking) {
      this.logger.warn(`SKU ${skuId} does not have unit tracking enabled, skipping sync`);
      return;
    }

    const previousStock = stock.currentStock;
    stock.currentStock = inStockCount;
    stock.reservedStock = 0; // No reservation with simplified model
    await this.updateCalculatedFields(stock);
    await stock.save();

    // Create transaction record if stock changed
    if (previousStock !== inStockCount) {
      const difference = inStockCount - previousStock;
      await this.transactionModel.create({
        storeId: new Types.ObjectId(storeId),
        stockId: stock._id,
        type: difference < 0 ? StockTransactionType.SALE : StockTransactionType.ADJUSTMENT,
        quantity: difference,
        previousStock,
        newStock: inStockCount,
        totalCost: Math.abs(difference) * stock.unitCost,
        notes: 'Auto-synced from unit status change',
        referenceType: 'unit_sync',
      });

      this.logger.log(`Stock synced from units for ${stock.sku}: ${previousStock} → ${inStockCount}`);
    }
  }

  /**
   * Audit stock to find mismatches between ProductStock and ProductUnits
   * Returns list of stocks where currentStock != count of in_stock units
   */
  async auditStock(userId: string, storeId: string): Promise<IStockAuditResult> {
    await this.getStoreWithAccess(storeId, userId);

    // Get all stocks for the store
    const stocks = await this.stockModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    }).lean();

    const mismatches: IStockAuditItem[] = [];

    for (const stock of stocks) {
      // Count units by status for this SKU
      const unitCounts = await this.unitModel.aggregate([
        {
          $match: {
            storeId: new Types.ObjectId(storeId),
            skuId: stock.skuId,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      // Build status counts
      const unitsByStatus = {
        in_stock: 0,
        sold: 0,
        hold: 0,
        damaged: 0,
      };
      let totalUnits = 0;

      for (const result of unitCounts) {
        unitsByStatus[result._id as keyof typeof unitsByStatus] = result.count;
        totalUnits += result.count;
      }

      const inStockUnits = unitsByStatus.in_stock;
      const difference = inStockUnits - stock.currentStock;

      // Only report mismatches
      if (difference !== 0) {
        mismatches.push({
          stockId: stock._id.toString(),
          sku: stock.sku,
          productName: stock.productName,
          hasUnitTracking: stock.hasUnitTracking || false,
          stockCount: stock.currentStock,
          unitCount: inStockUnits,
          difference,
          totalUnits,
          unitsByStatus,
        });
      }
    }

    return {
      storeId,
      auditedAt: new Date(),
      totalStocks: stocks.length,
      matchedCount: stocks.length - mismatches.length,
      mismatchedCount: mismatches.length,
      mismatches,
    };
  }

  /**
   * Reconcile stock to fix mismatches
   * Updates ProductStock.currentStock to match actual in_stock unit count
   * Only reconciles stocks with hasUnitTracking=true
   */
  async reconcileStock(userId: string, storeId: string): Promise<{ reconciled: number; skipped: number; details: any[] }> {
    await this.getStoreWithAccess(storeId, userId);

    // First audit to find mismatches
    const audit = await this.auditStock(userId, storeId);

    let reconciled = 0;
    let skipped = 0;
    const details: any[] = [];

    for (const mismatch of audit.mismatches) {
      // Skip stocks without unit tracking - they need manual review
      if (!mismatch.hasUnitTracking) {
        skipped++;
        details.push({
          sku: mismatch.sku,
          action: 'skipped',
          reason: 'hasUnitTracking is false - manual review required',
          stockCount: mismatch.stockCount,
          unitCount: mismatch.unitCount,
        });
        continue;
      }

      // Update stock to match unit count
      const stock = await this.stockModel.findById(mismatch.stockId);
      if (!stock) continue;

      const previousStock = stock.currentStock;
      stock.currentStock = mismatch.unitCount;
      await this.updateCalculatedFields(stock);
      await stock.save();

      // Create transaction record
      await this.transactionModel.create({
        storeId: new Types.ObjectId(storeId),
        stockId: stock._id,
        type: StockTransactionType.ADJUSTMENT,
        quantity: mismatch.difference,
        previousStock,
        newStock: mismatch.unitCount,
        totalCost: Math.abs(mismatch.difference) * stock.unitCost,
        notes: `Reconciliation: adjusted from ${previousStock} to ${mismatch.unitCount} (${mismatch.difference > 0 ? '+' : ''}${mismatch.difference})`,
        referenceType: 'reconciliation',
        performedBy: new Types.ObjectId(userId),
      });

      reconciled++;
      details.push({
        sku: mismatch.sku,
        action: 'reconciled',
        previousStock,
        newStock: mismatch.unitCount,
        difference: mismatch.difference,
      });

      this.logger.log(`Reconciled stock for ${mismatch.sku}: ${previousStock} → ${mismatch.unitCount}`);
    }

    return { reconciled, skipped, details };
  }
}
