import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductionBatch } from './schema';
import { Material } from '../inventory-materials/schema';
import { SKU } from '../inventory-skus/schema';
import { Store } from '../store/schema';
import { InventoryMaterialsService } from '../inventory-materials/service';
import { ProductUnitService } from '../product-unit/service';
import { ProductionBatchStatus, ProductionBatchType } from './enum';
import {
  IProductionBatch,
  IProductionBatchResponse,
  IProductionBatchCostSummary,
} from './interface';
import {
  CreateProductionBatchDto,
  UpdateProductionBatchDto,
  StartProductionDto,
  CompleteProductionDto,
  CancelProductionDto,
  QueryProductionBatchDto,
} from './dto';

@Injectable()
export class ProductionBatchesService {
  private readonly logger = new Logger(ProductionBatchesService.name);

  constructor(
    @InjectModel(ProductionBatch.name)
    private batchModel: Model<ProductionBatch>,
    @InjectModel(Material.name) private materialModel: Model<Material>,
    @InjectModel(SKU.name) private skuModel: Model<SKU>,
    @InjectModel(Store.name) private storeModel: Model<Store>,
    private readonly materialsService: InventoryMaterialsService,
    private readonly productUnitService: ProductUnitService,
  ) {}

  /**
   * Convert document to interface
   */
  private toInterface(doc: ProductionBatch): IProductionBatch {
    return {
      _id: doc._id as any,
      storeId: doc.storeId as any,
      batchNumber: doc.batchNumber,
      skuId: doc.skuId as any,
      type: doc.type,
      status: doc.status,
      plannedQuantity: doc.plannedQuantity,
      completedQuantity: doc.completedQuantity,
      defectQuantity: doc.defectQuantity,
      consumedMaterials: doc.consumedMaterials.map((m) => ({
        materialId: m.materialId as any,
        plannedQuantity: m.plannedQuantity,
        actualQuantity: m.actualQuantity,
        unit: m.unit,
        unitCost: m.unitCost,
        totalCost: m.totalCost,
      })),
      laborCost: doc.laborCost,
      overheadCost: doc.overheadCost,
      totalCost: doc.totalCost,
      costPerUnit: doc.costPerUnit,
      notes: doc.notes,
      plannedStartDate: doc.plannedStartDate,
      actualStartDate: doc.actualStartDate,
      completedDate: doc.completedDate,
      createdBy: doc.createdBy as any,
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
   * Generate batch number: BTH-YYYY-XXXXX
   */
  private async generateBatchNumber(storeId: Types.ObjectId): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BTH-${year}-`;

    const lastBatch = await this.batchModel
      .findOne({ storeId, batchNumber: { $regex: `^${prefix}` } })
      .sort({ batchNumber: -1 });

    let nextNumber = 1;
    if (lastBatch) {
      const lastNumber = parseInt(
        lastBatch.batchNumber.replace(prefix, ''),
        10,
      );
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  /**
   * Create a new production batch
   */
  async create(
    storeId: string,
    userId: string,
    dto: CreateProductionBatchDto,
  ): Promise<IProductionBatchResponse> {
    await this.getStoreWithAccess(storeId, userId);

    // Verify SKU exists
    const sku = await this.skuModel.findOne({
      _id: new Types.ObjectId(dto.skuId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!sku) {
      throw new NotFoundException('SKU not found');
    }

    const storeObjectId = new Types.ObjectId(storeId);

    // Generate batch number
    const batchNumber = await this.generateBatchNumber(storeObjectId);

    // Prepare consumed materials from DTO or from SKU BOM
    const consumedMaterials: any[] = [];

    if (dto.consumedMaterials && dto.consumedMaterials.length > 0) {
      // Use provided materials
      for (const mat of dto.consumedMaterials) {
        const material = await this.materialModel.findOne({
          _id: new Types.ObjectId(mat.materialId),
          storeId: storeObjectId,
          isDeleted: false,
        });

        if (!material) {
          throw new NotFoundException(`Material ${mat.materialId} not found`);
        }

        consumedMaterials.push({
          materialId: material._id,
          plannedQuantity: mat.plannedQuantity * dto.plannedQuantity, // Multiply by batch size
          unit: mat.unit,
          unitCost: material.averageCost,
          totalCost: 0, // Will be calculated on completion
        });
      }
    } else if (sku.materials && sku.materials.length > 0) {
      // Use SKU's BOM
      for (const bomItem of sku.materials) {
        const material = await this.materialModel.findOne({
          _id: bomItem.materialId,
          isDeleted: false,
        });

        if (material) {
          consumedMaterials.push({
            materialId: material._id,
            plannedQuantity: bomItem.quantity * dto.plannedQuantity, // Multiply by batch size
            unit: bomItem.unit,
            unitCost: material.averageCost,
            totalCost: 0,
          });
        }
      }
    }

    const batch = await this.batchModel.create({
      storeId: storeObjectId,
      batchNumber,
      skuId: new Types.ObjectId(dto.skuId),
      type: dto.type || ProductionBatchType.STANDARD,
      status: ProductionBatchStatus.PLANNED,
      plannedQuantity: dto.plannedQuantity,
      completedQuantity: 0,
      defectQuantity: 0,
      consumedMaterials,
      laborCost: dto.laborCost || sku.laborCost * dto.plannedQuantity,
      overheadCost: dto.overheadCost || sku.overheadCost * dto.plannedQuantity,
      totalCost: 0,
      costPerUnit: 0,
      notes: dto.notes || '',
      plannedStartDate: dto.plannedStartDate || new Date(),
      createdBy: new Types.ObjectId(userId),
    });

    this.logger.log(`Production batch created: ${batchNumber}`);
    return this.findById(userId, batch._id.toString());
  }

  /**
   * Find all batches for a store with filters
   */
  async findByStore(
    userId: string,
    query: QueryProductionBatchDto,
  ): Promise<{
    data: IProductionBatchResponse[];
    total: number;
    page: number;
    pages: number;
  }> {
    if (!query.storeId) {
      throw new BadRequestException('storeId is required');
    }

    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.skuId) {
      filter.skuId = new Types.ObjectId(query.skuId);
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.type) {
      filter.type = query.type;
    }

    if (query.startDate || query.endDate) {
      filter.plannedStartDate = {};
      if (query.startDate)
        filter.plannedStartDate.$gte = new Date(query.startDate);
      if (query.endDate) filter.plannedStartDate.$lte = new Date(query.endDate);
    }

    if (query.keyword) {
      filter.batchNumber = { $regex: query.keyword, $options: 'i' };
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    const [batches, total] = await Promise.all([
      this.batchModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size),
      this.batchModel.countDocuments(filter),
    ]);

    // Enrich with SKU and material data
    const enrichedBatches = await Promise.all(
      batches.map(async (batch) => this.enrichBatch(batch)),
    );

    return {
      data: enrichedBatches,
      total,
      page,
      pages: Math.ceil(total / size),
    };
  }

  /**
   * Get batch by ID
   */
  async findById(
    userId: string,
    batchId: string,
  ): Promise<IProductionBatchResponse> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    return this.enrichBatch(batch);
  }

  /**
   * Enrich batch with SKU and material names
   */
  private async enrichBatch(
    batch: ProductionBatch,
  ): Promise<IProductionBatchResponse> {
    const sku = await this.skuModel.findById(batch.skuId);

    const enrichedMaterials = await Promise.all(
      batch.consumedMaterials.map(async (mat) => {
        const material = await this.materialModel.findById(mat.materialId);
        return {
          materialId: mat.materialId as any,
          plannedQuantity: mat.plannedQuantity,
          actualQuantity: mat.actualQuantity,
          unit: mat.unit,
          unitCost: mat.unitCost,
          totalCost: mat.totalCost,
          material: material
            ? {
                _id: material._id as any,
                sku: material.sku,
                name: material.name,
              }
            : undefined,
        };
      }),
    );

    return {
      ...this.toInterface(batch),
      sku: sku
        ? {
            _id: sku._id as any,
            sku: sku.sku,
            title: sku.title,
          }
        : undefined,
      consumedMaterials: enrichedMaterials as any,
    };
  }

  /**
   * Update a planned batch
   */
  async update(
    userId: string,
    batchId: string,
    dto: UpdateProductionBatchDto,
  ): Promise<IProductionBatchResponse> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    // Can only update planned batches
    if (batch.status !== ProductionBatchStatus.PLANNED) {
      throw new ConflictException('Can only update batches in PLANNED status');
    }

    if (dto.type !== undefined) batch.type = dto.type;
    if (dto.plannedQuantity !== undefined)
      batch.plannedQuantity = dto.plannedQuantity;
    if (dto.laborCost !== undefined) batch.laborCost = dto.laborCost;
    if (dto.overheadCost !== undefined) batch.overheadCost = dto.overheadCost;
    if (dto.notes !== undefined) batch.notes = dto.notes;
    if (dto.plannedStartDate !== undefined)
      batch.plannedStartDate = dto.plannedStartDate;

    // Update consumed materials if provided
    if (dto.consumedMaterials !== undefined) {
      const consumedMaterials: any[] = [];
      for (const mat of dto.consumedMaterials) {
        const material = await this.materialModel.findOne({
          _id: new Types.ObjectId(mat.materialId),
          storeId: batch.storeId,
          isDeleted: false,
        });

        if (!material) {
          throw new NotFoundException(`Material ${mat.materialId} not found`);
        }

        consumedMaterials.push({
          materialId: material._id,
          plannedQuantity: mat.plannedQuantity,
          actualQuantity: mat.actualQuantity,
          unit: mat.unit,
          unitCost: material.averageCost,
          totalCost: 0,
        });
      }
      batch.consumedMaterials = consumedMaterials;
    }

    await batch.save();
    this.logger.log(`Production batch updated: ${batch.batchNumber}`);
    return this.findById(userId, batchId);
  }

  /**
   * Start production
   */
  async startProduction(
    userId: string,
    batchId: string,
    dto: StartProductionDto,
  ): Promise<IProductionBatchResponse> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    if (batch.status !== ProductionBatchStatus.PLANNED) {
      throw new ConflictException(
        'Can only start production from PLANNED status',
      );
    }

    // Verify material availability
    for (const mat of batch.consumedMaterials) {
      const material = await this.materialModel.findById(mat.materialId);
      if (!material) {
        throw new NotFoundException(`Material ${mat.materialId} not found`);
      }
      if (material.currentStock < mat.plannedQuantity) {
        throw new BadRequestException(
          `Insufficient stock for ${material.name}. Required: ${mat.plannedQuantity}, Available: ${material.currentStock}`,
        );
      }
    }

    batch.status = ProductionBatchStatus.IN_PROGRESS;
    batch.actualStartDate = dto.actualStartDate || new Date();
    await batch.save();

    this.logger.log(`Production started: ${batch.batchNumber}`);
    return this.findById(userId, batchId);
  }

  /**
   * Complete production - deducts materials and calculates costs
   */
  async completeProduction(
    userId: string,
    batchId: string,
    dto: CompleteProductionDto,
  ): Promise<IProductionBatchResponse> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    if (
      batch.status !== ProductionBatchStatus.IN_PROGRESS &&
      batch.status !== ProductionBatchStatus.QC_PENDING
    ) {
      throw new ConflictException(
        'Can only complete production from IN_PROGRESS or QC_PENDING status',
      );
    }

    // Update actual quantities if provided
    if (dto.actualMaterials) {
      for (const actual of dto.actualMaterials) {
        const matIndex = batch.consumedMaterials.findIndex(
          (m) => m.materialId.toString() === actual.materialId,
        );
        if (matIndex !== -1) {
          batch.consumedMaterials[matIndex].actualQuantity =
            actual.actualQuantity;
        }
      }
    } else {
      // Use planned quantities as actual
      for (let i = 0; i < batch.consumedMaterials.length; i++) {
        batch.consumedMaterials[i].actualQuantity =
          batch.consumedMaterials[i].plannedQuantity;
      }
    }

    // Deduct materials from stock
    let totalMaterialsCost = 0;
    for (const mat of batch.consumedMaterials) {
      const quantityToDeduct = mat.actualQuantity || mat.plannedQuantity;

      // Get current material cost
      const material = await this.materialModel.findById(mat.materialId);
      if (!material) {
        throw new NotFoundException(`Material ${mat.materialId} not found`);
      }

      // Calculate cost before deducting
      mat.unitCost = material.averageCost;
      mat.totalCost = quantityToDeduct * material.averageCost;
      totalMaterialsCost += mat.totalCost;

      // Deduct stock using materials service
      await this.materialsService.deductStock(
        userId,
        mat.materialId.toString(),
        quantityToDeduct,
        batch.batchNumber,
        `Production batch: ${batch.batchNumber}`,
      );
    }

    // Calculate total cost
    batch.completedQuantity = dto.completedQuantity;
    batch.defectQuantity = dto.defectQuantity || 0;
    batch.totalCost = totalMaterialsCost + batch.laborCost + batch.overheadCost;
    batch.costPerUnit =
      batch.completedQuantity > 0
        ? Math.round((batch.totalCost / batch.completedQuantity) * 100) / 100
        : 0;
    batch.status = ProductionBatchStatus.COMPLETED;
    batch.completedDate = new Date();

    if (dto.notes) {
      batch.notes = batch.notes ? `${batch.notes}\n${dto.notes}` : dto.notes;
    }

    await batch.save();

    // Create individual ProductUnit records (stock is calculated from units)
    if (dto.completedQuantity > 0) {
      const sku = await this.skuModel.findById(batch.skuId);
      if (sku) {
        const unitResult = await this.productUnitService.createUnitsFromBatch({
          storeId: batch.storeId.toString(),
          skuId: batch.skuId.toString(),
          sku: sku.sku,
          productName: sku.title,
          batchId: batch._id.toString(),
          batchNumber: batch.batchNumber,
          quantity: dto.completedQuantity,
          unitCost: batch.costPerUnit,
          rfidCodes: dto.rfidCodes,
        });
        this.logger.log(
          `Created ${unitResult.created} product units for batch ${batch.batchNumber}`,
        );
      }
    }

    this.logger.log(
      `Production completed: ${batch.batchNumber}, ${dto.completedQuantity} units at ${batch.costPerUnit}/unit`,
    );
    return this.findById(userId, batchId);
  }

  /**
   * Move to QC pending
   */
  async sendToQC(
    userId: string,
    batchId: string,
  ): Promise<IProductionBatchResponse> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    if (batch.status !== ProductionBatchStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Can only send to QC from IN_PROGRESS status',
      );
    }

    batch.status = ProductionBatchStatus.QC_PENDING;
    await batch.save();

    this.logger.log(`Production sent to QC: ${batch.batchNumber}`);
    return this.findById(userId, batchId);
  }

  /**
   * Cancel production
   */
  async cancelProduction(
    userId: string,
    batchId: string,
    dto: CancelProductionDto,
  ): Promise<IProductionBatchResponse> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    if (batch.status === ProductionBatchStatus.COMPLETED) {
      throw new ConflictException('Cannot cancel completed production');
    }

    batch.status = ProductionBatchStatus.CANCELLED;
    if (dto.reason) {
      batch.notes = batch.notes
        ? `${batch.notes}\nCancelled: ${dto.reason}`
        : `Cancelled: ${dto.reason}`;
    }
    await batch.save();

    this.logger.log(`Production cancelled: ${batch.batchNumber}`);
    return this.findById(userId, batchId);
  }

  /**
   * Delete a batch (soft delete)
   */
  async delete(userId: string, batchId: string): Promise<void> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    if (batch.status === ProductionBatchStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Cannot delete batch in progress. Cancel it first.',
      );
    }

    batch.isDeleted = true;
    await batch.save();

    this.logger.log(`Production batch deleted: ${batch.batchNumber}`);
  }

  /**
   * Get cost summary for a batch
   */
  async getCostSummary(
    userId: string,
    batchId: string,
  ): Promise<IProductionBatchCostSummary> {
    const batch = await this.batchModel.findOne({
      _id: new Types.ObjectId(batchId),
      isDeleted: false,
    });

    if (!batch) {
      throw new NotFoundException('Production batch not found');
    }

    await this.getStoreWithAccess(batch.storeId.toString(), userId);

    const materialsCost = batch.consumedMaterials.reduce(
      (sum, m) => sum + (m.totalCost || 0),
      0,
    );

    return {
      materialsCost,
      laborCost: batch.laborCost,
      overheadCost: batch.overheadCost,
      totalCost: batch.totalCost,
      costPerUnit: batch.costPerUnit,
      completedQuantity: batch.completedQuantity,
    };
  }

  /**
   * Get production statistics for a store
   */
  async getStats(userId: string, storeId: string): Promise<any> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);

    const [planned, inProgress, qcPending, completed, cancelled] =
      await Promise.all([
        this.batchModel.countDocuments({
          storeId: storeObjectId,
          status: ProductionBatchStatus.PLANNED,
          isDeleted: false,
        }),
        this.batchModel.countDocuments({
          storeId: storeObjectId,
          status: ProductionBatchStatus.IN_PROGRESS,
          isDeleted: false,
        }),
        this.batchModel.countDocuments({
          storeId: storeObjectId,
          status: ProductionBatchStatus.QC_PENDING,
          isDeleted: false,
        }),
        this.batchModel.countDocuments({
          storeId: storeObjectId,
          status: ProductionBatchStatus.COMPLETED,
          isDeleted: false,
        }),
        this.batchModel.countDocuments({
          storeId: storeObjectId,
          status: ProductionBatchStatus.CANCELLED,
          isDeleted: false,
        }),
      ]);

    // Get this month's completed batches
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const completedThisMonth = await this.batchModel.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          status: ProductionBatchStatus.COMPLETED,
          completedDate: { $gte: startOfMonth },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: '$completedQuantity' },
          totalCost: { $sum: '$totalCost' },
          batchCount: { $sum: 1 },
        },
      },
    ]);

    return {
      byStatus: { planned, inProgress, qcPending, completed, cancelled },
      thisMonth: completedThisMonth[0] || {
        totalUnits: 0,
        totalCost: 0,
        batchCount: 0,
      },
    };
  }
}
