import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductUnit } from './schema';
import { Store } from '../store/schema';
import { SKU } from '../inventory-skus/schema';
import { ProductUnitStatus } from './enum';
import {
  IProductUnit,
  IProductUnitCountsByStatus,
  IProductUnitListResponse,
  IBulkCreateResult,
  IStockItem,
  IStockSummary,
  IStockResponse,
} from './interface';
import {
  QueryProductUnitDto,
  UpdateUnitStatusDto,
  CreateUnitsFromBatchDto,
} from './dto';

@Injectable()
export class ProductUnitService {
  private readonly logger = new Logger(ProductUnitService.name);

  constructor(
    @InjectModel(ProductUnit.name) private unitModel: Model<ProductUnit>,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    @InjectModel(SKU.name) private skuModel: Model<SKU>,
  ) {}

  /**
   * Convert document to interface
   */
  private toInterface(doc: ProductUnit): IProductUnit {
    return {
      _id: doc._id as any,
      storeId: doc.storeId as any,
      rfidCode: doc.rfidCode,
      skuId: doc.skuId as any,
      sku: doc.sku,
      productName: doc.productName,
      batchId: doc.batchId as any,
      batchNumber: doc.batchNumber,
      unitCost: doc.unitCost,
      status: doc.status,
      location: doc.location,
      orderId: doc.orderId as any,
      orderNumber: doc.orderNumber,
      soldAt: doc.soldAt,
      holdReason: (doc as any).holdReason,
      holdAt: (doc as any).holdAt,
      holdByUserId: (doc as any).holdByUserId as any,
      damagedReason: (doc as any).damagedReason,
      damagedAt: (doc as any).damagedAt,
      damagedByUserId: (doc as any).damagedByUserId as any,
      productionDate: doc.productionDate,
      notes: doc.notes,
      isDeleted: doc.isDeleted,
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    };
  }

  /**
   * Verify store access
   */
  private async getStoreWithAccess(
    storeId: string,
    userId: string,
  ): Promise<any> {
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
   * Generate a unique RFID code
   * Format: {storePrefix}-{skuCode}-{timestamp}-{sequence}
   */
  async generateRfidCode(storeId: string, skuCode: string): Promise<string> {
    const storePrefix = storeId.substring(0, 6).toUpperCase();
    const cleanSku = skuCode
      .replace(/[^a-zA-Z0-9-]/g, '')
      .substring(0, 20)
      .toUpperCase();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .substring(0, 14);

    // Find existing codes with same prefix to get next sequence
    const prefix = `${storePrefix}-${cleanSku}-${timestamp}`;
    const existingCount = await this.unitModel.countDocuments({
      rfidCode: { $regex: `^${prefix}` },
    });

    const sequence = (existingCount + 1).toString().padStart(3, '0');
    return `${prefix}-${sequence}`;
  }

  /**
   * Generate multiple RFID codes
   */
  async generateBulkRfidCodes(
    storeId: string,
    skuCode: string,
    count: number,
  ): Promise<string[]> {
    const storePrefix = storeId.substring(0, 6).toUpperCase();
    const cleanSku = skuCode
      .replace(/[^a-zA-Z0-9-]/g, '')
      .substring(0, 20)
      .toUpperCase();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .substring(0, 14);
    const prefix = `${storePrefix}-${cleanSku}-${timestamp}`;

    // Get current max sequence for this prefix
    const existing = await this.unitModel
      .find({ rfidCode: { $regex: `^${prefix}` } })
      .select('rfidCode')
      .lean();

    let maxSeq = 0;
    for (const unit of existing) {
      const parts = unit.rfidCode.split('-');
      const seq = parseInt(parts[parts.length - 1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }

    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const sequence = (maxSeq + i + 1).toString().padStart(3, '0');
      codes.push(`${prefix}-${sequence}`);
    }

    return codes;
  }

  /**
   * Validate RFID codes are unique
   */
  async validateRfidCodes(
    rfidCodes: string[],
  ): Promise<{ valid: boolean; duplicates: string[] }> {
    const existing = await this.unitModel
      .find({ rfidCode: { $in: rfidCodes } })
      .select('rfidCode')
      .lean();

    const duplicates = existing.map((e) => e.rfidCode);
    return {
      valid: duplicates.length === 0,
      duplicates,
    };
  }

  /**
   * Create units from a production batch
   */
  async createUnitsFromBatch(
    dto: CreateUnitsFromBatchDto,
  ): Promise<IBulkCreateResult> {
    const {
      storeId,
      skuId,
      sku,
      productName,
      batchId,
      batchNumber,
      quantity,
      unitCost,
      rfidCodes,
      location,
    } = dto;

    let codes: string[];

    if (rfidCodes && rfidCodes.length > 0) {
      // Validate manual RFID codes
      if (rfidCodes.length !== quantity) {
        throw new BadRequestException(
          `Number of RFID codes (${rfidCodes.length}) must match quantity (${quantity})`,
        );
      }

      const validation = await this.validateRfidCodes(rfidCodes);
      if (!validation.valid) {
        throw new ConflictException(
          `Duplicate RFID codes found: ${validation.duplicates.join(', ')}`,
        );
      }

      codes = rfidCodes;
    } else {
      // Auto-generate RFID codes
      codes = await this.generateBulkRfidCodes(storeId, sku, quantity);
    }

    const productionDate = new Date();
    const units = codes.map((rfidCode) => ({
      storeId: new Types.ObjectId(storeId),
      rfidCode,
      skuId: new Types.ObjectId(skuId),
      sku,
      productName,
      batchId: new Types.ObjectId(batchId),
      batchNumber,
      unitCost,
      status: ProductUnitStatus.IN_STOCK,
      location: location || '',
      productionDate,
      isDeleted: false,
    }));

    await this.unitModel.insertMany(units, { ordered: false });

    this.logger.log(
      `Created ${quantity} product units for batch ${batchNumber}`,
    );

    return {
      created: quantity,
      rfidCodes: codes,
    };
  }

  /**
   * Get available units for a SKU (FIFO - oldest first)
   */
  async getAvailableUnits(
    storeId: string,
    skuId: string,
    limit?: number,
  ): Promise<IProductUnit[]> {
    const query: any = {
      storeId: new Types.ObjectId(storeId),
      skuId: new Types.ObjectId(skuId),
      status: ProductUnitStatus.IN_STOCK,
      isDeleted: false,
    };

    let cursor = this.unitModel.find(query).sort({ createdAt: 1 });

    if (limit) {
      cursor = cursor.limit(limit);
    }

    const units = await cursor.lean();
    return units.map((u) => this.toInterface(u as any));
  }

  /**
   * Find unit by RFID code
   */
  async findByRfidCode(
    storeId: string,
    rfidCode: string,
  ): Promise<IProductUnit | null> {
    const unit = await this.unitModel.findOne({
      storeId: new Types.ObjectId(storeId),
      rfidCode,
      isDeleted: false,
    });

    return unit ? this.toInterface(unit) : null;
  }

  /**
   * Bulk lookup by RFID codes
   */
  async findByRfidCodes(
    storeId: string,
    rfidCodes: string[],
  ): Promise<IProductUnit[]> {
    const units = await this.unitModel.find({
      storeId: new Types.ObjectId(storeId),
      rfidCode: { $in: rfidCodes },
      isDeleted: false,
    });

    return units.map((u) => this.toInterface(u));
  }

  /**
   * Find unit by ID
   */
  async findById(unitId: string): Promise<IProductUnit> {
    const unit = await this.unitModel.findOne({
      _id: new Types.ObjectId(unitId),
      isDeleted: false,
    });

    if (!unit) {
      throw new NotFoundException('Product unit not found');
    }

    return this.toInterface(unit);
  }

  /**
   * Mark units as sold (direct sale from in_stock)
   * Automatically syncs Product Stock for affected SKUs
   */
  async markAsSold(
    userId: string,
    unitIds: string[],
    orderId: string,
    orderNumber: string,
  ): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    // Verify all units are in_stock
    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: ProductUnitStatus.IN_STOCK,
      isDeleted: false,
    });

    if (units.length !== unitIds.length) {
      throw new BadRequestException('Some units are not available for sale');
    }

    // Mark all units as sold
    await this.unitModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          status: ProductUnitStatus.SOLD,
          orderId: new Types.ObjectId(orderId),
          orderNumber,
          soldAt: new Date(),
        },
      },
    );

    this.logger.log(
      `Marked ${units.length} units as sold for order ${orderNumber}`,
    );

    // Fetch updated units
    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Put units on hold (temporarily unavailable)
   * Deducts from available stock, can be reversed via unholdUnits
   */
  async holdUnits(
    userId: string,
    unitIds: string[],
    reason: string,
  ): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    // Verify all units are in_stock
    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: ProductUnitStatus.IN_STOCK,
      isDeleted: false,
    });

    if (units.length !== unitIds.length) {
      const foundIds = units.map((u) => u._id.toString());
      const missingIds = unitIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(
        `Some units are not available to hold. Missing or invalid: ${missingIds.length} units`,
      );
    }

    // Mark all units as hold
    await this.unitModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          status: ProductUnitStatus.HOLD,
          holdReason: reason,
          holdAt: new Date(),
          holdByUserId: new Types.ObjectId(userId),
        },
      },
    );

    this.logger.log(
      `Placed ${units.length} units on hold by user ${userId}: ${reason}`,
    );

    // Fetch updated units
    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Release units from hold back to in_stock
   * Restores units to available stock
   */
  async unholdUnits(
    userId: string,
    unitIds: string[],
  ): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    // Verify all units are on hold
    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: ProductUnitStatus.HOLD,
      isDeleted: false,
    });

    if (units.length !== unitIds.length) {
      throw new BadRequestException('Some units are not on hold');
    }

    // Mark all units as in_stock
    await this.unitModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          status: ProductUnitStatus.IN_STOCK,
        },
        $unset: {
          holdReason: '',
          holdAt: '',
          holdByUserId: '',
        },
      },
    );

    this.logger.log(
      `Released ${units.length} units from hold by user ${userId}`,
    );

    // Fetch updated units
    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Mark units as damaged (permanent, cannot be reversed)
   * Deducts from available stock permanently
   */
  async markAsDamaged(
    userId: string,
    unitIds: string[],
    reason: string,
  ): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    // Can mark in_stock or hold units as damaged
    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: { $in: [ProductUnitStatus.IN_STOCK, ProductUnitStatus.HOLD] },
      isDeleted: false,
    });

    if (units.length !== unitIds.length) {
      throw new BadRequestException(
        'Some units cannot be marked as damaged (may be sold or already damaged)',
      );
    }

    // Mark all units as damaged
    await this.unitModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          status: ProductUnitStatus.DAMAGED,
          damagedReason: reason,
          damagedAt: new Date(),
          damagedByUserId: new Types.ObjectId(userId),
        },
        $unset: {
          holdReason: '',
          holdAt: '',
          holdByUserId: '',
        },
      },
    );

    this.logger.log(
      `Marked ${units.length} units as damaged by user ${userId}: ${reason}`,
    );

    // Fetch updated units
    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Release sold units back to in_stock (for order cancellation)
   * Only called by OrderItemService when order is cancelled
   */
  async releaseFromOrder(unitIds: string[]): Promise<void> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: ProductUnitStatus.SOLD,
      isDeleted: false,
    });

    if (units.length === 0) return;

    await this.unitModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          status: ProductUnitStatus.IN_STOCK,
        },
        $unset: {
          orderId: '',
          orderNumber: '',
          soldAt: '',
        },
      },
    );

    this.logger.log(`Released ${units.length} units from cancelled order`);
  }

  /**
   * Update unit location only
   * Status changes must go through specific methods (holdUnits, unholdUnits, markAsDamaged)
   */
  async updateUnitLocation(
    userId: string,
    unitId: string,
    location: string,
  ): Promise<IProductUnit> {
    const unit = await this.unitModel.findOne({
      _id: new Types.ObjectId(unitId),
      isDeleted: false,
    });

    if (!unit) {
      throw new NotFoundException('Product unit not found');
    }

    unit.location = location;
    await unit.save();

    return this.toInterface(unit);
  }

  /**
   * @deprecated Use holdUnits(), unholdUnits(), markAsDamaged() instead
   * Update unit - RESTRICTED
   * Only allows location and notes updates, NOT status changes
   *
   * Status changes must go through:
   * - holdUnits() / unholdUnits() - for hold/unhold
   * - markAsDamaged() - for damage
   * - markAsSold() - for sales (via order confirmation)
   * - releaseFromOrder() - for order cancellation
   */
  async updateUnitStatus(
    userId: string,
    unitId: string,
    dto: UpdateUnitStatusDto,
  ): Promise<IProductUnit> {
    const unit = await this.unitModel.findOne({
      _id: new Types.ObjectId(unitId),
      isDeleted: false,
    });

    if (!unit) {
      throw new NotFoundException('Product unit not found');
    }

    // RESTRICT: Do not allow direct status changes
    if (dto.status && dto.status !== unit.status) {
      throw new BadRequestException(
        'Direct status changes are not allowed. Use holdUnits(), unholdUnits(), or markAsDamaged() instead.',
      );
    }

    // Only allow location and notes updates
    if (dto.notes) {
      unit.notes = dto.notes;
    }
    if (dto.location) {
      unit.location = dto.location;
    }

    await unit.save();

    return this.toInterface(unit);
  }

  /**
   * Get units by batch (traceability)
   */
  async getUnitsByBatch(batchId: string): Promise<IProductUnit[]> {
    const units = await this.unitModel
      .find({
        batchId: new Types.ObjectId(batchId),
        isDeleted: false,
      })
      .sort({ createdAt: 1 });

    return units.map((u) => this.toInterface(u));
  }

  /**
   * Get units by order
   */
  async getUnitsByOrder(orderId: string): Promise<IProductUnit[]> {
    const units = await this.unitModel.find({
      orderId: new Types.ObjectId(orderId),
      isDeleted: false,
    });

    return units.map((u) => this.toInterface(u));
  }

  /**
   * Get unit counts by status for a SKU
   */
  async getUnitCountsByStatus(
    storeId: string,
    skuId: string,
  ): Promise<IProductUnitCountsByStatus> {
    const results = await this.unitModel.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(storeId),
          skuId: new Types.ObjectId(skuId),
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

    const counts: IProductUnitCountsByStatus = {
      in_stock: 0,
      sold: 0,
      damaged: 0,
      hold: 0,
      total: 0,
    };

    for (const result of results) {
      counts[result._id as keyof IProductUnitCountsByStatus] = result.count;
      counts.total += result.count;
    }

    return counts;
  }

  /**
   * Count in-stock units for a SKU
   */
  async countInStockUnits(storeId: string, skuId: string): Promise<number> {
    return this.unitModel.countDocuments({
      storeId: new Types.ObjectId(storeId),
      skuId: new Types.ObjectId(skuId),
      status: ProductUnitStatus.IN_STOCK,
      isDeleted: false,
    });
  }

  /**
   * List units with filters and pagination
   */
  async findAll(
    storeId: string,
    userId: string,
    query: QueryProductUnitDto,
  ): Promise<IProductUnitListResponse> {
    await this.getStoreWithAccess(storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    };

    if (query.skuId) {
      filter.skuId = new Types.ObjectId(query.skuId);
    }
    if (query.sku) {
      filter.sku = { $regex: query.sku, $options: 'i' };
    }
    if (query.batchId) {
      filter.batchId = new Types.ObjectId(query.batchId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.orderId) {
      filter.orderId = new Types.ObjectId(query.orderId);
    }
    if (query.rfidCode) {
      filter.rfidCode = { $regex: query.rfidCode, $options: 'i' };
    }
    if (query.location) {
      filter.location = { $regex: query.location, $options: 'i' };
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) {
        filter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        filter.createdAt.$lte = new Date(query.endDate);
      }
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const [units, total] = await Promise.all([
      this.unitModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size)
        .lean(),
      this.unitModel.countDocuments(filter),
    ]);

    return {
      units: units.map((u) => this.toInterface(u as any)),
      total,
      page,
      pages: Math.ceil(total / size),
    };
  }

  /**
   * Soft delete a unit
   */
  async delete(userId: string, unitId: string): Promise<void> {
    const unit = await this.unitModel.findOne({
      _id: new Types.ObjectId(unitId),
      isDeleted: false,
    });

    if (!unit) {
      throw new NotFoundException('Product unit not found');
    }

    unit.isDeleted = true;
    await unit.save();
  }

  // ========================================
  // Stock Aggregation Methods (replaces ProductStock)
  // ========================================

  /**
   * Get stock summary across all SKUs
   */
  async getStockSummary(
    userId: string,
    storeId: string,
  ): Promise<IStockSummary> {
    await this.getStoreWithAccess(storeId, userId);

    // Get all SKUs with their settings
    const skus = await this.skuModel
      .find({
        storeId: new Types.ObjectId(storeId),
        isDeleted: false,
      })
      .lean();

    // Aggregate unit counts by SKU
    const unitCounts = await this.unitModel.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(storeId),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: { skuId: '$skuId', status: '$status' },
          count: { $sum: 1 },
          totalValue: { $sum: '$unitCost' },
        },
      },
    ]);

    // Build summary
    let totalUnits = 0;
    let totalValue = 0;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    // Create map of SKU -> counts
    const skuCounts = new Map<
      string,
      { in_stock: number; total: number; value: number }
    >();

    for (const item of unitCounts) {
      const skuId = item._id.skuId.toString();
      if (!skuCounts.has(skuId)) {
        skuCounts.set(skuId, { in_stock: 0, total: 0, value: 0 });
      }
      const counts = skuCounts.get(skuId)!;
      counts.total += item.count;

      if (item._id.status === ProductUnitStatus.IN_STOCK) {
        counts.in_stock = item.count;
        counts.value = item.totalValue;
        totalUnits += item.count;
        totalValue += item.totalValue;
      }
    }

    // Classify SKUs
    for (const sku of skus) {
      const counts = skuCounts.get(sku._id.toString()) || {
        in_stock: 0,
        total: 0,
        value: 0,
      };
      const minLevel = sku.minStockLevel || 0;

      if (counts.in_stock === 0) {
        outOfStock++;
      } else if (minLevel > 0 && counts.in_stock <= minLevel) {
        lowStock++;
      } else {
        inStock++;
      }
    }

    return {
      totalSkus: skus.length,
      totalUnits,
      totalValue,
      inStock,
      lowStock,
      outOfStock,
    };
  }

  /**
   * Get stock list with pagination (replaces ProductStock getAll)
   */
  async getStockList(
    userId: string,
    storeId: string,
    options: {
      keyword?: string;
      status?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
      category?: string;
      page?: number;
      size?: number;
    } = {},
  ): Promise<IStockResponse> {
    await this.getStoreWithAccess(storeId, userId);

    const { keyword, status = 'all', category, page = 1, size = 20 } = options;

    // Get SKUs with optional filters
    const skuFilter: any = {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    };

    if (keyword) {
      skuFilter.$or = [
        { sku: { $regex: keyword, $options: 'i' } },
        { title: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (category) {
      skuFilter.category = category;
    }

    const skus = await this.skuModel.find(skuFilter).lean();

    // Aggregate unit counts by SKU
    const unitAggregation = await this.unitModel.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(storeId),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: { skuId: '$skuId', status: '$status' },
          count: { $sum: 1 },
          totalCost: { $sum: '$unitCost' },
          lastDate: { $max: '$productionDate' },
        },
      },
    ]);

    // Build stock items
    const stockItems: IStockItem[] = [];

    for (const sku of skus) {
      const skuId = sku._id.toString();

      // Get counts for this SKU
      const skuUnits = unitAggregation.filter(
        (u) => u._id.skuId.toString() === skuId,
      );

      let currentStock = 0;
      let holdStock = 0;
      let soldStock = 0;
      let damagedStock = 0;
      let totalUnits = 0;
      let totalCost = 0;
      let lastProductionDate: Date | undefined;

      for (const u of skuUnits) {
        totalUnits += u.count;
        if (u._id.status === ProductUnitStatus.IN_STOCK) {
          currentStock = u.count;
          totalCost = u.totalCost;
          lastProductionDate = u.lastDate;
        } else if (u._id.status === ProductUnitStatus.HOLD) {
          holdStock = u.count;
        } else if (u._id.status === ProductUnitStatus.SOLD) {
          soldStock = u.count;
        } else if (u._id.status === ProductUnitStatus.DAMAGED) {
          damagedStock = u.count;
        }
      }

      const avgUnitCost = currentStock > 0 ? totalCost / currentStock : 0;
      const minLevel = sku.minStockLevel || 0;

      // Determine status
      let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
      if (currentStock === 0) {
        stockStatus = 'out_of_stock';
      } else if (minLevel > 0 && currentStock <= minLevel) {
        stockStatus = 'low_stock';
      } else {
        stockStatus = 'in_stock';
      }

      // Apply status filter
      if (status !== 'all' && stockStatus !== status) {
        continue;
      }

      stockItems.push({
        skuId,
        sku: sku.sku,
        productName: sku.title,
        category: sku.category,
        currentStock,
        holdStock,
        soldStock,
        damagedStock,
        totalUnits,
        avgUnitCost,
        totalValue: currentStock * avgUnitCost,
        minStockLevel: sku.minStockLevel || 0,
        reorderPoint: sku.reorderPoint || 0,
        reorderQuantity: sku.reorderQuantity || 0,
        status: stockStatus,
        lastProductionDate,
      });
    }

    // Sort by productName
    stockItems.sort((a, b) => a.productName.localeCompare(b.productName));

    // Paginate
    const total = stockItems.length;
    const pages = Math.ceil(total / size);
    const paginatedItems = stockItems.slice((page - 1) * size, page * size);

    // Calculate summary
    const summary: IStockSummary = {
      totalSkus: stockItems.length,
      totalUnits: stockItems.reduce((sum, i) => sum + i.currentStock, 0),
      totalValue: stockItems.reduce((sum, i) => sum + i.totalValue, 0),
      inStock: stockItems.filter((i) => i.status === 'in_stock').length,
      lowStock: stockItems.filter((i) => i.status === 'low_stock').length,
      outOfStock: stockItems.filter((i) => i.status === 'out_of_stock').length,
    };

    return {
      items: paginatedItems,
      summary,
      total,
      page,
      pages,
    };
  }

  /**
   * Get low stock items (for alerts)
   */
  async getLowStockItems(
    userId: string,
    storeId: string,
  ): Promise<IStockItem[]> {
    const result = await this.getStockList(userId, storeId, {
      status: 'low_stock',
      size: 100,
    });
    return result.items;
  }

  /**
   * Get stock for a specific SKU
   */
  async getStockBySku(
    userId: string,
    storeId: string,
    skuCode: string,
  ): Promise<IStockItem | null> {
    await this.getStoreWithAccess(storeId, userId);

    const sku = await this.skuModel
      .findOne({
        storeId: new Types.ObjectId(storeId),
        sku: skuCode,
        isDeleted: false,
      })
      .lean();

    if (!sku) {
      return null;
    }

    const result = await this.getStockList(userId, storeId, {
      keyword: skuCode,
      size: 1,
    });
    return result.items[0] || null;
  }
}
