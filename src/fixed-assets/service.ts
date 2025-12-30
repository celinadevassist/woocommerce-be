import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FixedAsset } from './schema';
import { Store } from '../store/schema';
import { AssetStatus, DepreciationMethod } from './enum';
import { IAssetWithDepreciation, IAssetSummary } from './interface';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
  CreateMaintenanceLogDto,
  QueryFixedAssetDto,
} from './dto';

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(
    @InjectModel(FixedAsset.name) private assetModel: Model<FixedAsset>,
    @InjectModel(Store.name) private storeModel: Model<Store>,
  ) {}

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
   * Calculate depreciation for an asset
   */
  private calculateDepreciation(asset: FixedAsset): {
    currentBookValue: number;
    accumulatedDepreciation: number;
    monthlyDepreciation: number;
  } {
    const purchaseDate = new Date(asset.purchaseDate);
    const now = new Date();
    const monthsOwned = Math.max(0,
      (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
      (now.getMonth() - purchaseDate.getMonth())
    );

    const depreciableAmount = asset.purchaseCost - (asset.salvageValue || 0);
    const totalMonths = (asset.usefulLifeYears || 5) * 12;

    if (asset.depreciationMethod === DepreciationMethod.NONE || depreciableAmount <= 0) {
      return {
        currentBookValue: asset.purchaseCost,
        accumulatedDepreciation: 0,
        monthlyDepreciation: 0,
      };
    }

    let accumulatedDepreciation = 0;
    let monthlyDepreciation = 0;

    if (asset.depreciationMethod === DepreciationMethod.STRAIGHT_LINE) {
      monthlyDepreciation = depreciableAmount / totalMonths;
      accumulatedDepreciation = Math.min(monthlyDepreciation * monthsOwned, depreciableAmount);
    } else if (asset.depreciationMethod === DepreciationMethod.DECLINING_BALANCE) {
      // Double declining balance method
      const annualRate = (2 / (asset.usefulLifeYears || 5));
      let bookValue = asset.purchaseCost;
      const yearsOwned = monthsOwned / 12;

      for (let year = 0; year < Math.floor(yearsOwned); year++) {
        const yearDepreciation = Math.min(bookValue * annualRate, bookValue - (asset.salvageValue || 0));
        accumulatedDepreciation += yearDepreciation;
        bookValue -= yearDepreciation;
      }

      // Partial year
      const remainingMonths = monthsOwned % 12;
      if (remainingMonths > 0) {
        const partialDepreciation = Math.min(
          (bookValue * annualRate) * (remainingMonths / 12),
          bookValue - (asset.salvageValue || 0)
        );
        accumulatedDepreciation += partialDepreciation;
      }

      monthlyDepreciation = accumulatedDepreciation / Math.max(monthsOwned, 1);
    }

    const currentBookValue = Math.max(asset.purchaseCost - accumulatedDepreciation, asset.salvageValue || 0);

    return {
      currentBookValue: Math.round(currentBookValue * 100) / 100,
      accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
      monthlyDepreciation: Math.round(monthlyDepreciation * 100) / 100,
    };
  }

  /**
   * Convert asset to response with depreciation
   */
  private assetToResponse(asset: FixedAsset): IAssetWithDepreciation {
    const depreciation = this.calculateDepreciation(asset);
    return {
      ...asset.toObject(),
      ...depreciation,
    };
  }

  // ========================
  // CRUD Operations
  // ========================

  async create(storeId: string, userId: string, dto: CreateFixedAssetDto): Promise<IAssetWithDepreciation> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);
    const userObjectId = new Types.ObjectId(userId);

    // Check for duplicate asset tag
    const existing = await this.assetModel.findOne({
      storeId: storeObjectId,
      assetTag: dto.assetTag,
      isDeleted: false,
    });

    if (existing) {
      throw new ConflictException(`Asset tag "${dto.assetTag}" already exists`);
    }

    const asset = await this.assetModel.create({
      storeId: storeObjectId,
      name: dto.name,
      assetTag: dto.assetTag,
      category: dto.category,
      description: dto.description || '',
      serialNumber: dto.serialNumber || '',
      purchaseDate: new Date(dto.purchaseDate),
      purchaseCost: dto.purchaseCost,
      supplier: dto.supplier || '',
      status: dto.status || AssetStatus.ACTIVE,
      location: dto.location || '',
      assignedTo: dto.assignedTo || '',
      warranty: dto.warranty ? {
        expiresAt: dto.warranty.expiresAt ? new Date(dto.warranty.expiresAt) : undefined,
        provider: dto.warranty.provider || '',
        notes: dto.warranty.notes || '',
      } : undefined,
      usefulLifeYears: dto.usefulLifeYears || 5,
      salvageValue: dto.salvageValue || 0,
      depreciationMethod: dto.depreciationMethod || DepreciationMethod.STRAIGHT_LINE,
      nextServiceDate: dto.nextServiceDate ? new Date(dto.nextServiceDate) : undefined,
      notes: dto.notes || '',
      createdBy: userObjectId,
    });

    this.logger.log(`Fixed asset created: ${dto.name} (${dto.assetTag})`);
    return this.assetToResponse(asset);
  }

  async findAll(userId: string, query: QueryFixedAssetDto): Promise<{
    assets: IAssetWithDepreciation[];
    total: number;
    page: number;
    pages: number;
  }> {
    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { assetTag: { $regex: query.keyword, $options: 'i' } },
        { serialNumber: { $regex: query.keyword, $options: 'i' } },
      ];
    }
    if (query.maintenanceDue) {
      filter.nextServiceDate = { $lte: new Date() };
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const [assets, total] = await Promise.all([
      this.assetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(size),
      this.assetModel.countDocuments(filter),
    ]);

    return {
      assets: assets.map(a => this.assetToResponse(a)),
      total,
      page,
      pages: Math.ceil(total / size),
    };
  }

  async findById(userId: string, assetId: string): Promise<IAssetWithDepreciation> {
    const asset = await this.assetModel.findOne({
      _id: new Types.ObjectId(assetId),
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.getStoreWithAccess(asset.storeId.toString(), userId);

    return this.assetToResponse(asset);
  }

  async update(userId: string, assetId: string, dto: UpdateFixedAssetDto): Promise<IAssetWithDepreciation> {
    const asset = await this.assetModel.findOne({
      _id: new Types.ObjectId(assetId),
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.getStoreWithAccess(asset.storeId.toString(), userId);

    // Check for duplicate asset tag if changing
    if (dto.assetTag && dto.assetTag !== asset.assetTag) {
      const existing = await this.assetModel.findOne({
        storeId: asset.storeId,
        assetTag: dto.assetTag,
        isDeleted: false,
        _id: { $ne: asset._id },
      });

      if (existing) {
        throw new ConflictException(`Asset tag "${dto.assetTag}" already exists`);
      }
    }

    // Update fields
    if (dto.name !== undefined) asset.name = dto.name;
    if (dto.assetTag !== undefined) asset.assetTag = dto.assetTag;
    if (dto.category !== undefined) asset.category = dto.category;
    if (dto.description !== undefined) asset.description = dto.description;
    if (dto.serialNumber !== undefined) asset.serialNumber = dto.serialNumber;
    if (dto.purchaseDate !== undefined) asset.purchaseDate = new Date(dto.purchaseDate);
    if (dto.purchaseCost !== undefined) asset.purchaseCost = dto.purchaseCost;
    if (dto.supplier !== undefined) asset.supplier = dto.supplier;
    if (dto.status !== undefined) asset.status = dto.status;
    if (dto.location !== undefined) asset.location = dto.location;
    if (dto.assignedTo !== undefined) asset.assignedTo = dto.assignedTo;
    if (dto.warranty !== undefined) {
      asset.warranty = dto.warranty ? {
        expiresAt: dto.warranty.expiresAt ? new Date(dto.warranty.expiresAt) : undefined,
        provider: dto.warranty.provider || '',
        notes: dto.warranty.notes || '',
      } : undefined;
    }
    if (dto.usefulLifeYears !== undefined) asset.usefulLifeYears = dto.usefulLifeYears;
    if (dto.salvageValue !== undefined) asset.salvageValue = dto.salvageValue;
    if (dto.depreciationMethod !== undefined) asset.depreciationMethod = dto.depreciationMethod;
    if (dto.nextServiceDate !== undefined) {
      asset.nextServiceDate = dto.nextServiceDate ? new Date(dto.nextServiceDate) : undefined;
    }
    if (dto.notes !== undefined) asset.notes = dto.notes;

    await asset.save();

    this.logger.log(`Fixed asset updated: ${asset.name}`);
    return this.assetToResponse(asset);
  }

  async delete(userId: string, assetId: string): Promise<void> {
    const asset = await this.assetModel.findOne({
      _id: new Types.ObjectId(assetId),
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.getStoreWithAccess(asset.storeId.toString(), userId);

    asset.isDeleted = true;
    await asset.save();

    this.logger.log(`Fixed asset deleted: ${asset.name}`);
  }

  // ========================
  // Maintenance
  // ========================

  async addMaintenanceLog(userId: string, assetId: string, dto: CreateMaintenanceLogDto): Promise<IAssetWithDepreciation> {
    const asset = await this.assetModel.findOne({
      _id: new Types.ObjectId(assetId),
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.getStoreWithAccess(asset.storeId.toString(), userId);

    const log = {
      _id: new Types.ObjectId(),
      date: new Date(dto.date),
      type: dto.type,
      description: dto.description,
      cost: dto.cost || 0,
      performedBy: dto.performedBy || '',
      createdBy: new Types.ObjectId(userId),
      createdAt: new Date(),
    };

    asset.maintenanceHistory.push(log as any);

    // Update next service date if provided
    if (dto.nextServiceDate) {
      asset.nextServiceDate = new Date(dto.nextServiceDate);
    }

    await asset.save();

    this.logger.log(`Maintenance logged for asset: ${asset.name}`);
    return this.assetToResponse(asset);
  }

  async deleteMaintenanceLog(userId: string, assetId: string, logId: string): Promise<IAssetWithDepreciation> {
    const asset = await this.assetModel.findOne({
      _id: new Types.ObjectId(assetId),
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.getStoreWithAccess(asset.storeId.toString(), userId);

    const logIndex = asset.maintenanceHistory.findIndex(
      (log: any) => log._id.toString() === logId
    );

    if (logIndex === -1) {
      throw new NotFoundException('Maintenance log not found');
    }

    asset.maintenanceHistory.splice(logIndex, 1);
    await asset.save();

    this.logger.log(`Maintenance log deleted from asset: ${asset.name}`);
    return this.assetToResponse(asset);
  }

  // ========================
  // Summary & Analytics
  // ========================

  async getSummary(userId: string, storeId: string): Promise<IAssetSummary> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const assets = await this.assetModel.find({
      storeId: storeObjectId,
      isDeleted: false,
    });

    let totalPurchaseValue = 0;
    let totalBookValue = 0;
    let totalDepreciation = 0;
    const byCategory: Record<string, { count: number; value: number }> = {};
    const byStatus: Record<string, number> = {};
    let maintenanceDueCount = 0;
    let warrantyExpiringCount = 0;

    assets.forEach(asset => {
      const depreciation = this.calculateDepreciation(asset);

      totalPurchaseValue += asset.purchaseCost;
      totalBookValue += depreciation.currentBookValue;
      totalDepreciation += depreciation.accumulatedDepreciation;

      // By category
      if (!byCategory[asset.category]) {
        byCategory[asset.category] = { count: 0, value: 0 };
      }
      byCategory[asset.category].count++;
      byCategory[asset.category].value += depreciation.currentBookValue;

      // By status
      byStatus[asset.status] = (byStatus[asset.status] || 0) + 1;

      // Maintenance due
      if (asset.nextServiceDate && new Date(asset.nextServiceDate) <= now) {
        maintenanceDueCount++;
      }

      // Warranty expiring within 30 days
      if (asset.warranty?.expiresAt) {
        const expiresAt = new Date(asset.warranty.expiresAt);
        if (expiresAt > now && expiresAt <= thirtyDaysFromNow) {
          warrantyExpiringCount++;
        }
      }
    });

    return {
      totalAssets: assets.length,
      totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
      totalBookValue: Math.round(totalBookValue * 100) / 100,
      totalDepreciation: Math.round(totalDepreciation * 100) / 100,
      byCategory,
      byStatus,
      maintenanceDueCount,
      warrantyExpiringCount,
    };
  }

  async getMaintenanceDue(userId: string, storeId: string): Promise<IAssetWithDepreciation[]> {
    await this.getStoreWithAccess(storeId, userId);

    const assets = await this.assetModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      nextServiceDate: { $lte: new Date() },
      status: { $ne: AssetStatus.DISPOSED },
    }).sort({ nextServiceDate: 1 });

    return assets.map(a => this.assetToResponse(a));
  }

  async getCategories(): Promise<{ categories: { value: string; label: string }[] }> {
    const { AssetCategory } = await import('./enum');
    const categories = Object.values(AssetCategory).map(c => ({
      value: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
    }));

    return { categories };
  }
}
