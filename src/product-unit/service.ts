import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductUnit } from './schema';
import { Store } from '../store/schema';
import { ProductUnitStatus } from './enum';
import { IProductUnit, IProductUnitCountsByStatus, IProductUnitListResponse, IBulkCreateResult } from './interface';
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
      reservedAt: doc.reservedAt,
      soldAt: doc.soldAt,
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
   * Generate a unique RFID code
   * Format: {storePrefix}-{skuCode}-{timestamp}-{sequence}
   */
  async generateRfidCode(storeId: string, skuCode: string): Promise<string> {
    const storePrefix = storeId.substring(0, 6).toUpperCase();
    const cleanSku = skuCode.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 20).toUpperCase();
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);

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
  async generateBulkRfidCodes(storeId: string, skuCode: string, count: number): Promise<string[]> {
    const storePrefix = storeId.substring(0, 6).toUpperCase();
    const cleanSku = skuCode.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 20).toUpperCase();
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
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
  async validateRfidCodes(rfidCodes: string[]): Promise<{ valid: boolean; duplicates: string[] }> {
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
  async createUnitsFromBatch(dto: CreateUnitsFromBatchDto): Promise<IBulkCreateResult> {
    const { storeId, skuId, sku, productName, batchId, batchNumber, quantity, unitCost, rfidCodes, location } = dto;

    let codes: string[];

    if (rfidCodes && rfidCodes.length > 0) {
      // Validate manual RFID codes
      if (rfidCodes.length !== quantity) {
        throw new BadRequestException(`Number of RFID codes (${rfidCodes.length}) must match quantity (${quantity})`);
      }

      const validation = await this.validateRfidCodes(rfidCodes);
      if (!validation.valid) {
        throw new ConflictException(`Duplicate RFID codes found: ${validation.duplicates.join(', ')}`);
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

    this.logger.log(`Created ${quantity} product units for batch ${batchNumber}`);

    return {
      created: quantity,
      rfidCodes: codes,
    };
  }

  /**
   * Get available units for a SKU (FIFO - oldest first)
   */
  async getAvailableUnits(storeId: string, skuId: string, limit?: number): Promise<IProductUnit[]> {
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
  async findByRfidCode(storeId: string, rfidCode: string): Promise<IProductUnit | null> {
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
  async findByRfidCodes(storeId: string, rfidCodes: string[]): Promise<IProductUnit[]> {
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
   * Reserve units for an order
   */
  async reserveUnits(userId: string, unitIds: string[], orderId: string): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    // Verify all units are available
    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: ProductUnitStatus.IN_STOCK,
      isDeleted: false,
    });

    if (units.length !== unitIds.length) {
      throw new BadRequestException('Some units are not available for reservation');
    }

    // Reserve all units
    await this.unitModel.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          status: ProductUnitStatus.RESERVED,
          orderId: new Types.ObjectId(orderId),
          reservedAt: new Date(),
        },
      },
    );

    // Fetch updated units
    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Mark units as sold
   */
  async markAsSold(userId: string, unitIds: string[], orderId: string, orderNumber: string): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    // Verify all units are reserved for this order (or in_stock for direct sale)
    const units = await this.unitModel.find({
      _id: { $in: objectIds },
      status: { $in: [ProductUnitStatus.RESERVED, ProductUnitStatus.IN_STOCK] },
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

    // Fetch updated units
    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Release reserved units (order cancelled)
   */
  async releaseReservedUnits(userId: string, unitIds: string[]): Promise<IProductUnit[]> {
    const objectIds = unitIds.map((id) => new Types.ObjectId(id));

    await this.unitModel.updateMany(
      {
        _id: { $in: objectIds },
        status: ProductUnitStatus.RESERVED,
      },
      {
        $set: {
          status: ProductUnitStatus.IN_STOCK,
        },
        $unset: {
          orderId: 1,
          orderNumber: 1,
          reservedAt: 1,
        },
      },
    );

    const updatedUnits = await this.unitModel.find({ _id: { $in: objectIds } });
    return updatedUnits.map((u) => this.toInterface(u));
  }

  /**
   * Update unit status (damaged, returned, etc.)
   */
  async updateUnitStatus(userId: string, unitId: string, dto: UpdateUnitStatusDto): Promise<IProductUnit> {
    const unit = await this.unitModel.findOne({
      _id: new Types.ObjectId(unitId),
      isDeleted: false,
    });

    if (!unit) {
      throw new NotFoundException('Product unit not found');
    }

    unit.status = dto.status;
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
    const units = await this.unitModel.find({
      batchId: new Types.ObjectId(batchId),
      isDeleted: false,
    }).sort({ createdAt: 1 });

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
  async getUnitCountsByStatus(storeId: string, skuId: string): Promise<IProductUnitCountsByStatus> {
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
      reserved: 0,
      sold: 0,
      damaged: 0,
      returned: 0,
      transferred: 0,
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
  async findAll(storeId: string, userId: string, query: QueryProductUnitDto): Promise<IProductUnitListResponse> {
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
      this.unitModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(size).lean(),
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
}
