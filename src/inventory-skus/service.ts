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
import { SKU, SKUDocument } from './schema';
import { CreateSKUDto, UpdateSKUDto, QuerySKUDto } from './dto';
import { ISKU, ISKUResponse, ISKUCostBreakdown, IBOMMaterial } from './interface';
import { SKUStatus } from './enum';
import { Material, MaterialDocument } from '../inventory-materials/schema';
import { Store, StoreDocument } from '../store/schema';

@Injectable()
export class InventorySKUsService {
  private readonly logger = new Logger(InventorySKUsService.name);

  constructor(
    @InjectModel(SKU.name) private skuModel: Model<SKUDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  /**
   * Create a new SKU
   */
  async create(userId: string, storeId: string, dto: CreateSKUDto): Promise<ISKU> {
    await this.getStoreWithAccess(storeId, userId);

    // Check for duplicate SKU (active)
    const existingSKU = await this.skuModel.findOne({
      storeId: new Types.ObjectId(storeId),
      sku: dto.sku,
      isDeleted: false,
    });

    if (existingSKU) {
      throw new ConflictException(`SKU "${dto.sku}" already exists`);
    }

    // Check for soft-deleted SKU with same code - restore it
    const deletedSKU = await this.skuModel.findOne({
      storeId: new Types.ObjectId(storeId),
      sku: dto.sku,
      isDeleted: true,
    });

    // Validate materials exist
    if (dto.materials && dto.materials.length > 0) {
      await this.validateMaterials(storeId, dto.materials);
    }

    let sku: SKUDocument;

    if (deletedSKU) {
      // Restore and update the deleted SKU
      deletedSKU.title = dto.title;
      deletedSKU.description = dto.description || '';
      deletedSKU.specs = dto.specs || {};
      deletedSKU.category = dto.category || '';
      deletedSKU.status = dto.status || SKUStatus.DRAFT;
      deletedSKU.materials = dto.materials?.map((m) => ({
        materialId: new Types.ObjectId(m.materialId),
        quantity: m.quantity,
        unit: m.unit,
        notes: m.notes || '',
      })) as any || [];
      deletedSKU.laborCost = dto.laborCost || 0;
      deletedSKU.overheadCost = dto.overheadCost || 0;
      deletedSKU.fixedCost = dto.fixedCost || false;
      deletedSKU.cost = dto.cost || 0;
      deletedSKU.sellingPrice = dto.sellingPrice || 0;
      deletedSKU.images = dto.images || [];
      deletedSKU.isDeleted = false;
      sku = deletedSKU;
      this.logger.log(`SKU restored: ${sku.sku} in store ${storeId}`);
    } else {
      // Create new SKU
      sku = await this.skuModel.create({
        storeId: new Types.ObjectId(storeId),
        sku: dto.sku,
        title: dto.title,
        description: dto.description || '',
        specs: dto.specs || {},
        category: dto.category || '',
        status: dto.status || 'draft',
        materials: dto.materials?.map((m) => ({
          materialId: new Types.ObjectId(m.materialId),
          quantity: m.quantity,
          unit: m.unit,
          notes: m.notes || '',
        })) || [],
        laborCost: dto.laborCost || 0,
        overheadCost: dto.overheadCost || 0,
        fixedCost: dto.fixedCost || false,
        cost: dto.cost || 0,
        calculatedCost: 0,
        sellingPrice: dto.sellingPrice || 0,
        images: dto.images || [],
      });
      this.logger.log(`SKU created: ${sku.sku} in store ${storeId}`);
    }

    // Calculate cost
    const calculatedCost = await this.calculateCost(sku);
    sku.calculatedCost = calculatedCost;
    await sku.save();

    return this.toInterface(sku);
  }

  /**
   * Get SKUs with pagination and filtering
   */
  async findByStore(userId: string, query: QuerySKUDto): Promise<ISKUResponse> {
    if (!query.storeId) {
      throw new BadRequestException('Store ID is required');
    }

    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.category) {
      filter.category = query.category;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { sku: { $regex: query.keyword, $options: 'i' } },
        { description: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'title';
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
    const sort: any = { [sortField]: sortOrder };

    const [skus, total] = await Promise.all([
      this.skuModel.find(filter).sort(sort).skip(skip).limit(size),
      this.skuModel.countDocuments(filter),
    ]);

    // Enrich with material details
    const enrichedSKUs = await Promise.all(skus.map((s) => this.enrichSKUWithMaterials(s)));

    return {
      skus: enrichedSKUs,
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single SKU by ID
   */
  async findById(userId: string, skuId: string): Promise<ISKU> {
    const sku = await this.skuModel.findOne({
      _id: new Types.ObjectId(skuId),
      isDeleted: false,
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    await this.getStoreWithAccess(sku.storeId.toString(), userId);
    return this.enrichSKUWithMaterials(sku);
  }

  /**
   * Update a SKU
   */
  async update(userId: string, skuId: string, dto: UpdateSKUDto): Promise<ISKU> {
    const sku = await this.skuModel.findOne({
      _id: new Types.ObjectId(skuId),
      isDeleted: false,
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    await this.getStoreWithAccess(sku.storeId.toString(), userId);

    // Validate materials if provided
    if (dto.materials) {
      await this.validateMaterials(sku.storeId.toString(), dto.materials);
    }

    // Update fields
    if (dto.title !== undefined) sku.title = dto.title;
    if (dto.description !== undefined) sku.description = dto.description;
    if (dto.specs !== undefined) sku.specs = dto.specs;
    if (dto.category !== undefined) sku.category = dto.category;
    if (dto.status !== undefined) sku.status = dto.status;
    if (dto.materials !== undefined) {
      sku.materials = dto.materials.map((m) => ({
        materialId: new Types.ObjectId(m.materialId),
        quantity: m.quantity,
        unit: m.unit,
        notes: m.notes || '',
      })) as any;
    }
    if (dto.laborCost !== undefined) sku.laborCost = dto.laborCost;
    if (dto.overheadCost !== undefined) sku.overheadCost = dto.overheadCost;
    if (dto.fixedCost !== undefined) sku.fixedCost = dto.fixedCost;
    if (dto.cost !== undefined) sku.cost = dto.cost;
    if (dto.sellingPrice !== undefined) sku.sellingPrice = dto.sellingPrice;
    if (dto.images !== undefined) sku.images = dto.images;

    // Recalculate cost
    sku.calculatedCost = await this.calculateCost(sku);

    await sku.save();
    this.logger.log(`SKU updated: ${sku.sku}`);
    return this.enrichSKUWithMaterials(sku);
  }

  /**
   * Soft delete a SKU
   */
  async delete(userId: string, skuId: string): Promise<void> {
    const sku = await this.skuModel.findOne({
      _id: new Types.ObjectId(skuId),
      isDeleted: false,
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    await this.getStoreWithAccess(sku.storeId.toString(), userId);

    // TODO: Check if SKU has existing product stock before deleting

    sku.isDeleted = true;
    await sku.save();
    this.logger.log(`SKU deleted: ${sku.sku}`);
  }

  /**
   * Get cost breakdown for a SKU
   */
  async getCostBreakdown(userId: string, skuId: string): Promise<ISKUCostBreakdown> {
    const sku = await this.skuModel.findOne({
      _id: new Types.ObjectId(skuId),
      isDeleted: false,
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    await this.getStoreWithAccess(sku.storeId.toString(), userId);

    const materialCosts: ISKUCostBreakdown['materials'] = [];
    let materialsTotalCost = 0;

    for (const bomItem of sku.materials) {
      const material = await this.materialModel.findById(bomItem.materialId);
      if (material) {
        const itemCost = bomItem.quantity * material.averageCost;
        materialsTotalCost += itemCost;
        materialCosts.push({
          materialId: material._id.toString(),
          materialName: material.name,
          quantity: bomItem.quantity,
          unitCost: material.averageCost,
          totalCost: Math.round(itemCost * 100) / 100,
        });
      }
    }

    const totalCost = materialsTotalCost + sku.laborCost + sku.overheadCost;

    return {
      materialsCost: Math.round(materialsTotalCost * 100) / 100,
      laborCost: sku.laborCost,
      overheadCost: sku.overheadCost,
      totalCost: Math.round(totalCost * 100) / 100,
      materials: materialCosts,
    };
  }

  /**
   * Recalculate and save cost for a SKU
   */
  async recalculateCost(userId: string, skuId: string): Promise<ISKU> {
    const sku = await this.skuModel.findOne({
      _id: new Types.ObjectId(skuId),
      isDeleted: false,
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    await this.getStoreWithAccess(sku.storeId.toString(), userId);

    sku.calculatedCost = await this.calculateCost(sku);
    await sku.save();

    this.logger.log(`SKU cost recalculated: ${sku.sku} = ${sku.calculatedCost}`);
    return this.enrichSKUWithMaterials(sku);
  }

  /**
   * Get unique categories for a store
   */
  async getCategories(userId: string, storeId: string): Promise<string[]> {
    await this.getStoreWithAccess(storeId, userId);

    const categories = await this.skuModel.distinct('category', {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
      category: { $ne: '' },
    });

    return categories.sort();
  }

  // Helper methods

  private async calculateCost(sku: SKUDocument): Promise<number> {
    let materialsCost = 0;

    for (const bomItem of sku.materials) {
      const material = await this.materialModel.findById(bomItem.materialId);
      if (material) {
        materialsCost += bomItem.quantity * material.averageCost;
      }
    }

    const totalCost = materialsCost + sku.laborCost + sku.overheadCost;
    return Math.round(totalCost * 100) / 100;
  }

  private async validateMaterials(storeId: string, materials: { materialId: string }[]): Promise<void> {
    for (const m of materials) {
      const material = await this.materialModel.findOne({
        _id: new Types.ObjectId(m.materialId),
        storeId: new Types.ObjectId(storeId),
        isDeleted: false,
      });

      if (!material) {
        throw new BadRequestException(`Material ${m.materialId} not found`);
      }
    }
  }

  private async enrichSKUWithMaterials(sku: SKUDocument): Promise<ISKU> {
    const enrichedMaterials: IBOMMaterial[] = [];

    for (const bomItem of sku.materials) {
      const material = await this.materialModel.findById(bomItem.materialId);
      const unitCost = material?.averageCost || 0;
      const totalCost = bomItem.quantity * unitCost;

      enrichedMaterials.push({
        materialId: bomItem.materialId.toString(),
        materialName: material?.name || 'Unknown',
        materialSku: material?.sku || '',
        quantity: bomItem.quantity,
        unit: bomItem.unit,
        unitCost,
        totalCost: Math.round(totalCost * 100) / 100,
        notes: bomItem.notes,
      });
    }

    return {
      _id: sku._id.toString(),
      storeId: sku.storeId.toString(),
      sku: sku.sku,
      title: sku.title,
      description: sku.description,
      specs: sku.specs,
      category: sku.category,
      status: sku.status,
      materials: enrichedMaterials,
      laborCost: sku.laborCost,
      overheadCost: sku.overheadCost,
      fixedCost: sku.fixedCost,
      cost: sku.cost,
      calculatedCost: sku.calculatedCost,
      sellingPrice: sku.sellingPrice,
      minStockLevel: sku.minStockLevel || 0,
      reorderPoint: sku.reorderPoint || 0,
      reorderQuantity: sku.reorderQuantity || 0,
      images: sku.images,
      isDeleted: sku.isDeleted,
      createdAt: sku.createdAt,
      updatedAt: sku.updatedAt,
    };
  }

  private async getStoreWithAccess(storeId: string, userId: string): Promise<StoreDocument> {
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

  private toInterface(doc: SKUDocument): ISKU {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      sku: obj.sku,
      title: obj.title,
      description: obj.description,
      specs: obj.specs,
      category: obj.category,
      status: obj.status,
      materials: obj.materials.map((m: any) => ({
        materialId: m.materialId.toString(),
        quantity: m.quantity,
        unit: m.unit,
        notes: m.notes,
      })),
      laborCost: obj.laborCost,
      overheadCost: obj.overheadCost,
      fixedCost: obj.fixedCost,
      cost: obj.cost,
      calculatedCost: obj.calculatedCost,
      sellingPrice: obj.sellingPrice,
      minStockLevel: obj.minStockLevel || 0,
      reorderPoint: obj.reorderPoint || 0,
      reorderQuantity: obj.reorderQuantity || 0,
      images: obj.images,
      isDeleted: obj.isDeleted,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
