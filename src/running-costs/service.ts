import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CostTemplate, CostEntry } from './schema';
import { Store } from '../store/schema';
import { CostType, CostCategory } from './enum';
import {
  ICostTemplate,
  ICostEntry,
  IMonthlySummary,
  ICostSummary,
} from './interface';
import {
  CreateCostTemplateDto,
  UpdateCostTemplateDto,
  CreateCostEntryDto,
  UpdateCostEntryDto,
  QueryCostTemplateDto,
  QueryCostEntryDto,
  QueryMonthlySummaryDto,
  BulkCreateEntriesDto,
} from './dto';

@Injectable()
export class RunningCostsService {
  private readonly logger = new Logger(RunningCostsService.name);

  constructor(
    @InjectModel(CostTemplate.name) private templateModel: Model<CostTemplate>,
    @InjectModel(CostEntry.name) private entryModel: Model<CostEntry>,
    @InjectModel(Store.name) private storeModel: Model<Store>,
  ) {}

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
   * Get current month in YYYY-MM format
   */
  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  /**
   * Get previous month in YYYY-MM format
   */
  private getPreviousMonth(month: string): string {
    const [year, m] = month.split('-').map(Number);
    const date = new Date(year, m - 2, 1); // m-2 because months are 0-indexed
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  // ========================
  // Cost Template Methods
  // ========================

  async createTemplate(
    storeId: string,
    userId: string,
    dto: CreateCostTemplateDto,
  ): Promise<ICostTemplate> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);

    // Check for duplicate name
    const existing = await this.templateModel.findOne({
      storeId: storeObjectId,
      name: dto.name,
      isDeleted: false,
    });

    if (existing) {
      throw new ConflictException(`Cost template "${dto.name}" already exists`);
    }

    const template = await this.templateModel.create({
      storeId: storeObjectId,
      name: dto.name,
      description: dto.description || '',
      type: dto.type,
      category: dto.category,
      defaultAmount: dto.defaultAmount,
      isActive: dto.isActive ?? true,
    });

    this.logger.log(`Cost template created: ${dto.name}`);
    return template.toObject() as ICostTemplate;
  }

  async getTemplates(
    userId: string,
    query: QueryCostTemplateDto,
  ): Promise<{ templates: ICostTemplate[]; total: number }> {
    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.category) filter.category = query.category;
    if (query.type) filter.type = query.type;
    if (query.isActive !== undefined) filter.isActive = query.isActive;

    const [templates, total] = await Promise.all([
      this.templateModel.find(filter).sort({ category: 1, name: 1 }),
      this.templateModel.countDocuments(filter),
    ]);

    return {
      templates: templates.map((t) => t.toObject() as ICostTemplate),
      total,
    };
  }

  async getTemplateById(
    userId: string,
    templateId: string,
  ): Promise<ICostTemplate> {
    const template = await this.templateModel.findOne({
      _id: new Types.ObjectId(templateId),
      isDeleted: false,
    });

    if (!template) {
      throw new NotFoundException('Cost template not found');
    }

    await this.getStoreWithAccess(template.storeId.toString(), userId);

    return template.toObject() as ICostTemplate;
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    dto: UpdateCostTemplateDto,
  ): Promise<ICostTemplate> {
    const template = await this.templateModel.findOne({
      _id: new Types.ObjectId(templateId),
      isDeleted: false,
    });

    if (!template) {
      throw new NotFoundException('Cost template not found');
    }

    await this.getStoreWithAccess(template.storeId.toString(), userId);

    // Check for duplicate name if changing
    if (dto.name && dto.name !== template.name) {
      const existing = await this.templateModel.findOne({
        storeId: template.storeId,
        name: dto.name,
        isDeleted: false,
        _id: { $ne: template._id },
      });

      if (existing) {
        throw new ConflictException(
          `Cost template "${dto.name}" already exists`,
        );
      }
    }

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.type !== undefined) template.type = dto.type;
    if (dto.category !== undefined) template.category = dto.category;
    if (dto.defaultAmount !== undefined)
      template.defaultAmount = dto.defaultAmount;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;

    await template.save();

    this.logger.log(`Cost template updated: ${template.name}`);
    return template.toObject() as ICostTemplate;
  }

  async deleteTemplate(userId: string, templateId: string): Promise<void> {
    const template = await this.templateModel.findOne({
      _id: new Types.ObjectId(templateId),
      isDeleted: false,
    });

    if (!template) {
      throw new NotFoundException('Cost template not found');
    }

    await this.getStoreWithAccess(template.storeId.toString(), userId);

    template.isDeleted = true;
    await template.save();

    this.logger.log(`Cost template deleted: ${template.name}`);
  }

  // ========================
  // Cost Entry Methods
  // ========================

  async createEntry(
    storeId: string,
    userId: string,
    dto: CreateCostEntryDto,
  ): Promise<ICostEntry> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);
    const userObjectId = new Types.ObjectId(userId);

    const entry = await this.entryModel.create({
      storeId: storeObjectId,
      templateId: dto.templateId
        ? new Types.ObjectId(dto.templateId)
        : undefined,
      name: dto.name,
      type: dto.type,
      category: dto.category,
      month: dto.month,
      amount: dto.amount,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      notes: dto.notes || '',
      createdBy: userObjectId,
    });

    this.logger.log(`Cost entry created: ${dto.name} for ${dto.month}`);
    return entry.toObject() as ICostEntry;
  }

  async bulkCreateEntries(
    storeId: string,
    userId: string,
    dto: BulkCreateEntriesDto,
  ): Promise<ICostEntry[]> {
    await this.getStoreWithAccess(storeId, userId);

    const storeObjectId = new Types.ObjectId(storeId);
    const userObjectId = new Types.ObjectId(userId);

    // Get all templates
    const templateIds = dto.entries.map(
      (e) => new Types.ObjectId(e.templateId),
    );
    const templates = await this.templateModel.find({
      _id: { $in: templateIds },
      storeId: storeObjectId,
      isDeleted: false,
    });

    const templateMap = new Map(templates.map((t) => [t._id.toString(), t]));

    const entriesToCreate = dto.entries.map((e) => {
      const template = templateMap.get(e.templateId);
      if (!template) {
        throw new BadRequestException(`Template ${e.templateId} not found`);
      }

      return {
        storeId: storeObjectId,
        templateId: template._id,
        name: template.name,
        type: template.type,
        category: template.category,
        month: dto.month,
        amount: e.amount ?? template.defaultAmount,
        paidAt: e.paidAt ? new Date(e.paidAt) : undefined,
        notes: e.notes || '',
        createdBy: userObjectId,
      };
    });

    const entries = await this.entryModel.insertMany(entriesToCreate);

    this.logger.log(
      `Bulk created ${entries.length} cost entries for ${dto.month}`,
    );
    return entries.map((e) => e.toObject() as ICostEntry);
  }

  async getEntries(
    userId: string,
    query: QueryCostEntryDto,
  ): Promise<{
    entries: ICostEntry[];
    total: number;
    page: number;
    pages: number;
    summary: IMonthlySummary;
  }> {
    await this.getStoreWithAccess(query.storeId, userId);

    const filter: any = {
      storeId: new Types.ObjectId(query.storeId),
      isDeleted: false,
    };

    if (query.month) filter.month = query.month;
    if (query.category) filter.category = query.category;
    if (query.type) filter.type = query.type;
    if (query.templateId)
      filter.templateId = new Types.ObjectId(query.templateId);

    const page = query.page || 1;
    const size = query.size || 50;
    const skip = (page - 1) * size;

    const [entries, total] = await Promise.all([
      this.entryModel
        .find(filter)
        .sort({ month: -1, category: 1, name: 1 })
        .skip(skip)
        .limit(size),
      this.entryModel.countDocuments(filter),
    ]);

    // Calculate summary for the filtered entries
    const summary = await this.calculateMonthlySummary(
      query.storeId,
      query.month || this.getCurrentMonth(),
    );

    return {
      entries: entries.map((e) => e.toObject() as ICostEntry),
      total,
      page,
      pages: Math.ceil(total / size),
      summary,
    };
  }

  async getEntryById(userId: string, entryId: string): Promise<ICostEntry> {
    const entry = await this.entryModel.findOne({
      _id: new Types.ObjectId(entryId),
      isDeleted: false,
    });

    if (!entry) {
      throw new NotFoundException('Cost entry not found');
    }

    await this.getStoreWithAccess(entry.storeId.toString(), userId);

    return entry.toObject() as ICostEntry;
  }

  async updateEntry(
    userId: string,
    entryId: string,
    dto: UpdateCostEntryDto,
  ): Promise<ICostEntry> {
    const entry = await this.entryModel.findOne({
      _id: new Types.ObjectId(entryId),
      isDeleted: false,
    });

    if (!entry) {
      throw new NotFoundException('Cost entry not found');
    }

    await this.getStoreWithAccess(entry.storeId.toString(), userId);

    if (dto.name !== undefined) entry.name = dto.name;
    if (dto.type !== undefined) entry.type = dto.type;
    if (dto.category !== undefined) entry.category = dto.category;
    if (dto.amount !== undefined) entry.amount = dto.amount;
    if (dto.paidAt !== undefined) entry.paidAt = new Date(dto.paidAt);
    if (dto.notes !== undefined) entry.notes = dto.notes;

    await entry.save();

    this.logger.log(`Cost entry updated: ${entry.name}`);
    return entry.toObject() as ICostEntry;
  }

  async deleteEntry(userId: string, entryId: string): Promise<void> {
    const entry = await this.entryModel.findOne({
      _id: new Types.ObjectId(entryId),
      isDeleted: false,
    });

    if (!entry) {
      throw new NotFoundException('Cost entry not found');
    }

    await this.getStoreWithAccess(entry.storeId.toString(), userId);

    entry.isDeleted = true;
    await entry.save();

    this.logger.log(`Cost entry deleted: ${entry.name}`);
  }

  // ========================
  // Summary & Analytics
  // ========================

  private async calculateMonthlySummary(
    storeId: string,
    month: string,
  ): Promise<IMonthlySummary> {
    const storeObjectId = new Types.ObjectId(storeId);

    const result = await this.entryModel.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          month,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          fixed: {
            $sum: { $cond: [{ $eq: ['$type', CostType.FIXED] }, '$amount', 0] },
          },
          variable: {
            $sum: {
              $cond: [{ $eq: ['$type', CostType.VARIABLE] }, '$amount', 0],
            },
          },
          entryCount: { $sum: 1 },
        },
      },
    ]);

    const categoryResult = await this.entryModel.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          month,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
    ]);

    const byCategory: Record<string, number> = {};
    categoryResult.forEach((c) => {
      byCategory[c._id] = c.total;
    });

    const data = result[0] || {
      total: 0,
      fixed: 0,
      variable: 0,
      entryCount: 0,
    };

    return {
      month,
      total: data.total,
      fixed: data.fixed,
      variable: data.variable,
      byCategory,
      entryCount: data.entryCount,
    };
  }

  async getMonthlySummaries(
    userId: string,
    query: QueryMonthlySummaryDto,
  ): Promise<IMonthlySummary[]> {
    await this.getStoreWithAccess(query.storeId, userId);

    const storeObjectId = new Types.ObjectId(query.storeId);
    const months = query.months || 6;

    // Generate list of months to query
    let currentMonth = query.endMonth || this.getCurrentMonth();
    const monthsList: string[] = [];
    for (let i = 0; i < months; i++) {
      monthsList.push(currentMonth);
      currentMonth = this.getPreviousMonth(currentMonth);
    }

    const result = await this.entryModel.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          month: { $in: monthsList },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$month',
          total: { $sum: '$amount' },
          fixed: {
            $sum: { $cond: [{ $eq: ['$type', CostType.FIXED] }, '$amount', 0] },
          },
          variable: {
            $sum: {
              $cond: [{ $eq: ['$type', CostType.VARIABLE] }, '$amount', 0],
            },
          },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    // Get category breakdown for each month
    const categoryBreakdown = await this.entryModel.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          month: { $in: monthsList },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: { month: '$month', category: '$category' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    // Build category map
    const categoryMap: Record<string, Record<string, number>> = {};
    categoryBreakdown.forEach((c) => {
      if (!categoryMap[c._id.month]) categoryMap[c._id.month] = {};
      categoryMap[c._id.month][c._id.category] = c.total;
    });

    return result.map((r) => ({
      month: r._id,
      total: r.total,
      fixed: r.fixed,
      variable: r.variable,
      byCategory: categoryMap[r._id] || {},
      entryCount: r.entryCount,
    }));
  }

  async getCostSummary(userId: string, storeId: string): Promise<ICostSummary> {
    await this.getStoreWithAccess(storeId, userId);

    const currentMonth = this.getCurrentMonth();
    const previousMonth = this.getPreviousMonth(currentMonth);

    const [currentSummary, previousSummary, yearSummaries] = await Promise.all([
      this.calculateMonthlySummary(storeId, currentMonth),
      this.calculateMonthlySummary(storeId, previousMonth),
      this.getMonthlySummaries(userId, { storeId, months: 12 }),
    ]);

    const percentChange =
      previousSummary.total > 0
        ? ((currentSummary.total - previousSummary.total) /
            previousSummary.total) *
          100
        : 0;

    const totalYTD = yearSummaries.reduce((sum, s) => sum + s.total, 0);
    const avgMonthly =
      yearSummaries.length > 0 ? totalYTD / yearSummaries.length : 0;

    return {
      currentMonth: currentSummary,
      previousMonth: previousSummary,
      percentChange: Math.round(percentChange * 100) / 100,
      avgMonthly: Math.round(avgMonthly * 100) / 100,
      totalYTD: Math.round(totalYTD * 100) / 100,
    };
  }

  async getCategories(): Promise<{
    categories: { value: string; label: string }[];
  }> {
    const categories = Object.values(CostCategory).map((c) => ({
      value: c,
      label: c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '),
    }));

    return { categories };
  }
}
