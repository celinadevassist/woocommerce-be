import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Material, MaterialDocument, MaterialTransaction, MaterialTransactionDocument } from './schema';
import { CreateMaterialDto, UpdateMaterialDto, QueryMaterialDto, AddStockDto, AdjustStockDto, QueryTransactionsDto } from './dto';
import { IMaterial, IMaterialResponse, IMaterialTransaction, IMaterialTransactionResponse, ILowStockMaterial } from './interface';
import { MaterialTransactionType, MaterialTransactionReferenceType } from './enum';
import { Store, StoreDocument } from '../store/schema';

@Injectable()
export class InventoryMaterialsService {
  private readonly logger = new Logger(InventoryMaterialsService.name);

  constructor(
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(MaterialTransaction.name) private transactionModel: Model<MaterialTransactionDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  /**
   * Create a new material
   */
  async create(userId: string, storeId: string, dto: CreateMaterialDto): Promise<IMaterial> {
    await this.getStoreWithAccess(storeId, userId);

    // Check for duplicate SKU
    const existingMaterial = await this.materialModel.findOne({
      storeId: new Types.ObjectId(storeId),
      sku: dto.sku,
      isDeleted: false,
    });

    if (existingMaterial) {
      throw new ConflictException(`Material with SKU "${dto.sku}" already exists`);
    }

    const material = await this.materialModel.create({
      storeId: new Types.ObjectId(storeId),
      sku: dto.sku,
      name: dto.name,
      description: dto.description || '',
      unit: dto.unit,
      category: dto.category || '',
      minStockLevel: dto.minStockLevel || 0,
      reorderPoint: dto.reorderPoint || 0,
      reorderQuantity: dto.reorderQuantity || 0,
      suppliers: dto.suppliers || [],
      currentStock: 0,
      averageCost: 0,
    });

    this.logger.log(`Material created: ${material.sku} in store ${storeId}`);
    return this.toInterface(material);
  }

  /**
   * Get materials with pagination and filtering
   */
  async findByStore(userId: string, query: QueryMaterialDto): Promise<IMaterialResponse> {
    if (!query.storeId) {
      throw new BadRequestException('Store ID is required');
    }

    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    // Filter by category
    if (query.category) {
      filter.category = query.category;
    }

    // Search by keyword
    if (query.keyword) {
      filter.$or = [
        { name: { $regex: query.keyword, $options: 'i' } },
        { sku: { $regex: query.keyword, $options: 'i' } },
        { description: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    // Sort
    const sortField = query.sortBy || 'name';
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
    const sort: any = { [sortField]: sortOrder };

    const [materials, total] = await Promise.all([
      this.materialModel.find(filter).sort(sort).skip(skip).limit(size),
      this.materialModel.countDocuments(filter),
    ]);

    return {
      materials: materials.map((m) => this.toInterface(m)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single material by ID
   */
  async findById(userId: string, materialId: string): Promise<IMaterial> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.getStoreWithAccess(material.storeId.toString(), userId);
    return this.toInterface(material);
  }

  /**
   * Update a material
   */
  async update(userId: string, materialId: string, dto: UpdateMaterialDto): Promise<IMaterial> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.getStoreWithAccess(material.storeId.toString(), userId);

    // Update fields
    if (dto.name !== undefined) material.name = dto.name;
    if (dto.description !== undefined) material.description = dto.description;
    if (dto.unit !== undefined) material.unit = dto.unit;
    if (dto.category !== undefined) material.category = dto.category;
    if (dto.minStockLevel !== undefined) material.minStockLevel = dto.minStockLevel;
    if (dto.reorderPoint !== undefined) material.reorderPoint = dto.reorderPoint;
    if (dto.reorderQuantity !== undefined) material.reorderQuantity = dto.reorderQuantity;
    if (dto.suppliers !== undefined) material.suppliers = dto.suppliers;

    await material.save();
    this.logger.log(`Material updated: ${material.sku}`);
    return this.toInterface(material);
  }

  /**
   * Soft delete a material
   */
  async delete(userId: string, materialId: string): Promise<void> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.getStoreWithAccess(material.storeId.toString(), userId);

    // Cannot delete material with stock > 0
    if (material.currentStock > 0) {
      throw new ConflictException('Cannot delete material with existing stock. Adjust stock to zero first.');
    }

    material.isDeleted = true;
    await material.save();
    this.logger.log(`Material deleted: ${material.sku}`);
  }

  /**
   * Add stock (purchase)
   * Implements weighted average cost calculation
   */
  async addStock(userId: string, materialId: string, dto: AddStockDto): Promise<IMaterial> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.getStoreWithAccess(material.storeId.toString(), userId);

    const previousStock = material.currentStock;
    const previousAvgCost = material.averageCost;
    const newStock = previousStock + dto.quantity;

    // Calculate weighted average cost
    // newAvgCost = (currentStock × currentAvgCost + newQty × newUnitCost) / (currentStock + newQty)
    const newAvgCost = previousStock === 0 && previousAvgCost === 0
      ? dto.unitCost
      : (previousStock * previousAvgCost + dto.quantity * dto.unitCost) / newStock;

    const totalCost = dto.quantity * dto.unitCost;

    // Update material
    material.currentStock = newStock;
    material.averageCost = Math.round(newAvgCost * 100) / 100; // Round to 2 decimal places
    await material.save();

    // Create transaction record
    await this.transactionModel.create({
      storeId: material.storeId,
      materialId: material._id,
      type: MaterialTransactionType.ADD,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      totalCost,
      previousStock,
      newStock,
      previousAvgCost,
      newAvgCost: material.averageCost,
      reference: dto.reference || '',
      referenceType: MaterialTransactionReferenceType.PURCHASE,
      notes: dto.notes || '',
      performedBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Stock added to ${material.sku}: +${dto.quantity} at ${dto.unitCost}/unit`);
    return this.toInterface(material);
  }

  /**
   * Adjust stock (correction or waste)
   * Does not affect average cost
   */
  async adjustStock(userId: string, materialId: string, dto: AdjustStockDto): Promise<IMaterial> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.getStoreWithAccess(material.storeId.toString(), userId);

    const previousStock = material.currentStock;
    const newStock = previousStock + dto.quantity;

    // Stock cannot go negative
    if (newStock < 0) {
      throw new BadRequestException(`Insufficient stock. Current: ${previousStock}, Attempted change: ${dto.quantity}`);
    }

    // Determine transaction type and reference type
    const transactionType = dto.type === 'WASTE' ? MaterialTransactionType.WASTE : MaterialTransactionType.ADJUST;
    const referenceType = dto.type === 'WASTE' ? MaterialTransactionReferenceType.WASTE : MaterialTransactionReferenceType.MANUAL;

    // Calculate total cost for the transaction (for reporting)
    const totalCost = Math.abs(dto.quantity) * material.averageCost;

    // Update material
    material.currentStock = newStock;
    await material.save();

    // Create transaction record
    await this.transactionModel.create({
      storeId: material.storeId,
      materialId: material._id,
      type: transactionType,
      quantity: dto.quantity,
      totalCost,
      previousStock,
      newStock,
      reference: dto.reference || '',
      referenceType,
      notes: dto.notes,
      performedBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Stock adjusted for ${material.sku}: ${dto.quantity > 0 ? '+' : ''}${dto.quantity} (${dto.type})`);
    return this.toInterface(material);
  }

  /**
   * Deduct stock for production
   * Called internally when completing production batches
   */
  async deductStock(
    userId: string,
    materialId: string,
    quantity: number,
    reference: string,
    notes?: string,
  ): Promise<IMaterial> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    const previousStock = material.currentStock;
    const newStock = previousStock - quantity;

    if (newStock < 0) {
      throw new BadRequestException(`Insufficient stock for ${material.name}. Current: ${previousStock}, Required: ${quantity}`);
    }

    const totalCost = quantity * material.averageCost;

    // Update material
    material.currentStock = newStock;
    await material.save();

    // Create transaction record
    await this.transactionModel.create({
      storeId: material.storeId,
      materialId: material._id,
      type: MaterialTransactionType.DEDUCT,
      quantity: -quantity,
      totalCost,
      previousStock,
      newStock,
      reference,
      referenceType: MaterialTransactionReferenceType.PRODUCTION,
      notes: notes || '',
      performedBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Stock deducted from ${material.sku}: -${quantity} for production`);
    return this.toInterface(material);
  }

  /**
   * Get transaction history for a material
   */
  async getTransactions(userId: string, materialId: string, query: QueryTransactionsDto): Promise<IMaterialTransactionResponse> {
    const material = await this.materialModel.findOne({
      _id: new Types.ObjectId(materialId),
      isDeleted: false,
    });

    if (!material) {
      throw new NotFoundException('Material not found');
    }

    await this.getStoreWithAccess(material.storeId.toString(), userId);

    const filter: any = { materialId: new Types.ObjectId(materialId) };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.referenceType) {
      filter.referenceType = query.referenceType;
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

    const [transactions, total] = await Promise.all([
      this.transactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(size),
      this.transactionModel.countDocuments(filter),
    ]);

    return {
      transactions: transactions.map((t) => this.toTransactionInterface(t)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get materials with low stock
   */
  async getLowStock(userId: string, storeId: string): Promise<ILowStockMaterial[]> {
    await this.getStoreWithAccess(storeId, userId);

    const materials = await this.materialModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      $expr: { $lt: ['$currentStock', '$minStockLevel'] },
    }).sort({ currentStock: 1 });

    return materials.map((m) => ({
      ...this.toInterface(m),
      stockDeficit: m.minStockLevel - m.currentStock,
    }));
  }

  /**
   * Get unique categories for a store
   */
  async getCategories(userId: string, storeId: string): Promise<string[]> {
    await this.getStoreWithAccess(storeId, userId);

    const categories = await this.materialModel.distinct('category', {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      category: { $ne: '' },
    });

    return categories.sort();
  }

  // Helper methods

  private async getStoreWithAccess(storeId: string, userId: string): Promise<StoreDocument> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify store access
    const isOwner = store.ownerId?.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  private toInterface(doc: MaterialDocument): IMaterial {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      sku: obj.sku,
      name: obj.name,
      description: obj.description,
      unit: obj.unit,
      category: obj.category,
      minStockLevel: obj.minStockLevel,
      reorderPoint: obj.reorderPoint,
      reorderQuantity: obj.reorderQuantity,
      suppliers: obj.suppliers,
      currentStock: obj.currentStock,
      averageCost: obj.averageCost,
      isDeleted: obj.isDeleted,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private toTransactionInterface(doc: MaterialTransactionDocument): IMaterialTransaction {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      materialId: obj.materialId.toString(),
      type: obj.type,
      quantity: obj.quantity,
      unitCost: obj.unitCost,
      totalCost: obj.totalCost,
      previousStock: obj.previousStock,
      newStock: obj.newStock,
      previousAvgCost: obj.previousAvgCost,
      newAvgCost: obj.newAvgCost,
      reference: obj.reference,
      referenceType: obj.referenceType,
      notes: obj.notes,
      performedBy: obj.performedBy.toString(),
      createdAt: obj.createdAt,
    };
  }
}
