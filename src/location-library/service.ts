import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StateGroup, StateGroupDocument } from './state-group.schema';
import { LocalState, LocalStateDocument } from './local-state.schema';
import {
  CreateStateGroupDto,
  UpdateStateGroupDto,
  CreateLocalStateDto,
  UpdateLocalStateDto,
  BulkCreateLocalStatesDto,
} from './dto';
import { ShippingService } from '../shipping/service';

@Injectable()
export class LocationLibraryService {
  private readonly logger = new Logger(LocationLibraryService.name);

  constructor(
    @InjectModel(StateGroup.name)
    private stateGroupModel: Model<StateGroupDocument>,
    @InjectModel(LocalState.name)
    private localStateModel: Model<LocalStateDocument>,
    private readonly shippingService: ShippingService,
  ) {}

  // ============== STATE GROUPS ==============

  async getGroups(
    userId: string,
    countryCode?: string,
  ): Promise<StateGroupDocument[]> {
    const query: any = { ownerId: new Types.ObjectId(userId) };
    if (countryCode) {
      query.countryCode = countryCode.toUpperCase();
    }
    return this.stateGroupModel.find(query).sort({ order: 1, name: 1 });
  }

  async getGroup(userId: string, groupId: string): Promise<StateGroupDocument> {
    const group = await this.stateGroupModel.findOne({
      _id: new Types.ObjectId(groupId),
      ownerId: new Types.ObjectId(userId),
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async createGroup(
    userId: string,
    dto: CreateStateGroupDto,
  ): Promise<StateGroupDocument> {
    // Check for duplicate name
    const existing = await this.stateGroupModel.findOne({
      ownerId: new Types.ObjectId(userId),
      name: dto.name,
    });
    if (existing) {
      throw new ConflictException('A group with this name already exists');
    }

    const group = new this.stateGroupModel({
      ...dto,
      countryCode: dto.countryCode.toUpperCase(),
      ownerId: new Types.ObjectId(userId),
    });
    return group.save();
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateStateGroupDto,
  ): Promise<StateGroupDocument> {
    const group = await this.getGroup(userId, groupId);

    // Check for duplicate name if changing name
    if (dto.name && dto.name !== group.name) {
      const existing = await this.stateGroupModel.findOne({
        ownerId: new Types.ObjectId(userId),
        name: dto.name,
        _id: { $ne: new Types.ObjectId(groupId) },
      });
      if (existing) {
        throw new ConflictException('A group with this name already exists');
      }
    }

    Object.assign(group, dto);
    return group.save();
  }

  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.getGroup(userId, groupId);

    // Remove group from all states that reference it
    await this.localStateModel.updateMany(
      { ownerId: new Types.ObjectId(userId), groups: group._id },
      { $pull: { groups: group._id } },
    );

    await group.deleteOne();
  }

  // ============== LOCAL STATES ==============

  async getStates(
    userId: string,
    countryCode?: string,
    groupId?: string,
  ): Promise<LocalStateDocument[]> {
    const query: any = { ownerId: new Types.ObjectId(userId) };
    if (countryCode) {
      query.countryCode = countryCode.toUpperCase();
    }
    if (groupId) {
      query.groups = new Types.ObjectId(groupId);
    }
    return this.localStateModel
      .find(query)
      .populate('groups')
      .sort({ countryCode: 1, order: 1, stateName: 1 });
  }

  async getState(userId: string, stateId: string): Promise<LocalStateDocument> {
    const state = await this.localStateModel
      .findOne({
        _id: new Types.ObjectId(stateId),
        ownerId: new Types.ObjectId(userId),
      })
      .populate('groups');
    if (!state) {
      throw new NotFoundException('State not found');
    }
    return state;
  }

  async getStateByCode(
    userId: string,
    countryCode: string,
    stateCode: string,
  ): Promise<LocalStateDocument | null> {
    return this.localStateModel
      .findOne({
        ownerId: new Types.ObjectId(userId),
        countryCode: countryCode.toUpperCase(),
        stateCode,
      })
      .populate('groups');
  }

  async createState(
    userId: string,
    dto: CreateLocalStateDto,
  ): Promise<LocalStateDocument> {
    // Check for duplicate
    const existing = await this.localStateModel.findOne({
      ownerId: new Types.ObjectId(userId),
      countryCode: dto.countryCode.toUpperCase(),
      stateCode: dto.stateCode,
    });
    if (existing) {
      throw new ConflictException(
        `State ${dto.countryCode}:${dto.stateCode} already exists in your library`,
      );
    }

    // Validate group IDs if provided
    if (dto.groups && dto.groups.length > 0) {
      const groups = await this.stateGroupModel.find({
        _id: { $in: dto.groups.map((id) => new Types.ObjectId(id)) },
        ownerId: new Types.ObjectId(userId),
      });
      if (groups.length !== dto.groups.length) {
        throw new BadRequestException('One or more group IDs are invalid');
      }
    }

    const state = new this.localStateModel({
      ...dto,
      countryCode: dto.countryCode.toUpperCase(),
      groups: dto.groups?.map((id) => new Types.ObjectId(id)) || [],
      ownerId: new Types.ObjectId(userId),
    });
    return (await state.save()).populate('groups');
  }

  async updateState(
    userId: string,
    stateId: string,
    dto: UpdateLocalStateDto,
  ): Promise<LocalStateDocument> {
    const state = await this.getState(userId, stateId);

    // Validate group IDs if provided
    if (dto.groups) {
      const groups = await this.stateGroupModel.find({
        _id: { $in: dto.groups.map((id) => new Types.ObjectId(id)) },
        ownerId: new Types.ObjectId(userId),
      });
      if (groups.length !== dto.groups.length) {
        throw new BadRequestException('One or more group IDs are invalid');
      }
      state.groups = dto.groups.map((id) => new Types.ObjectId(id)) as any;
    }

    if (dto.stateName) state.stateName = dto.stateName;
    if (dto.enabled !== undefined) state.enabled = dto.enabled;
    if (dto.order !== undefined) state.order = dto.order;
    if (dto.notes !== undefined) state.notes = dto.notes;

    return (await state.save()).populate('groups');
  }

  async deleteState(userId: string, stateId: string): Promise<void> {
    const state = await this.getState(userId, stateId);
    await state.deleteOne();
  }

  async bulkCreateStates(
    userId: string,
    dto: BulkCreateLocalStatesDto,
  ): Promise<{
    created: number;
    skipped: number;
    states: LocalStateDocument[];
  }> {
    const countryCode = dto.countryCode.toUpperCase();
    const results: LocalStateDocument[] = [];
    let created = 0;
    let skipped = 0;

    for (const stateDto of dto.states) {
      try {
        // Check if already exists
        const existing = await this.localStateModel.findOne({
          ownerId: new Types.ObjectId(userId),
          countryCode,
          stateCode: stateDto.stateCode,
        });

        if (existing) {
          // Update existing
          existing.stateName = stateDto.stateName;
          if (stateDto.originalName)
            existing.originalName = stateDto.originalName;
          if (stateDto.groups)
            existing.groups = stateDto.groups.map(
              (id) => new Types.ObjectId(id),
            ) as any;
          if (stateDto.isNew !== undefined) existing.isNew = stateDto.isNew;
          await existing.save();
          results.push(existing);
          skipped++;
        } else {
          // Create new
          const state = new this.localStateModel({
            ...stateDto,
            countryCode,
            groups: stateDto.groups?.map((id) => new Types.ObjectId(id)) || [],
            ownerId: new Types.ObjectId(userId),
          });
          await state.save();
          results.push(state);
          created++;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to create/update state ${stateDto.stateCode}: ${error.message}`,
        );
      }
    }

    return { created, skipped, states: results };
  }

  /**
   * Toggle state enabled/disabled and sync the change to WooCommerce.
   * Uses the CartFlow plugin's visibility endpoint to hide/show states
   * from the WooCommerce checkout dropdown. Verifies the change took
   * effect and reverts the local DB if WooCommerce didn't apply it.
   */
  async toggleStateEnabled(
    userId: string,
    stateId: string,
    enabled: boolean,
    storeId: string,
  ): Promise<LocalStateDocument> {
    const state = await this.getState(userId, stateId);
    const previousEnabled = state.enabled;
    state.enabled = enabled;
    await state.save();

    try {
      const result = await this.shippingService.setStateVisibility(
        storeId,
        userId,
        state.countryCode,
        state.stateCode,
        enabled,
      );

      if (!result.verified) {
        // WooCommerce didn't actually apply the change — revert local DB
        state.enabled = previousEnabled;
        await state.save();
        throw new Error(
          `WooCommerce did not apply the visibility change for ${state.countryCode}:${state.stateCode}. The state may be controlled by another plugin or theme.`,
        );
      }
    } catch (error) {
      if (error.message?.includes('WooCommerce did not apply')) {
        throw error;
      }
      // Revert local DB on any sync failure
      state.enabled = previousEnabled;
      await state.save();
      this.logger.warn(
        `Failed to sync state visibility to WooCommerce, reverted local change: ${error.message}`,
      );
      throw error;
    }

    return (await state.populate('groups')) as LocalStateDocument;
  }

  // ============== COUNTRIES SUMMARY ==============

  async getCountriesSummary(
    userId: string,
  ): Promise<
    Array<{ countryCode: string; stateCount: number; groupCount: number }>
  > {
    const stateAgg = await this.localStateModel.aggregate([
      { $match: { ownerId: new Types.ObjectId(userId) } },
      { $group: { _id: '$countryCode', stateCount: { $sum: 1 } } },
    ]);

    const groupAgg = await this.stateGroupModel.aggregate([
      { $match: { ownerId: new Types.ObjectId(userId) } },
      { $group: { _id: '$countryCode', groupCount: { $sum: 1 } } },
    ]);

    // Merge results
    const countryMap = new Map<
      string,
      { stateCount: number; groupCount: number }
    >();

    for (const item of stateAgg) {
      countryMap.set(item._id, { stateCount: item.stateCount, groupCount: 0 });
    }

    for (const item of groupAgg) {
      const existing = countryMap.get(item._id) || {
        stateCount: 0,
        groupCount: 0,
      };
      existing.groupCount = item.groupCount;
      countryMap.set(item._id, existing);
    }

    return Array.from(countryMap.entries()).map(([countryCode, data]) => ({
      countryCode,
      ...data,
    }));
  }

  // ============== SYNC TO STORE ==============

  async syncToStore(
    userId: string,
    storeId: string,
    countryCode: string,
    stateIds?: string[],
  ): Promise<{
    success: boolean;
    synced: number;
    groupsSynced: number;
    message: string;
  }> {
    // Get states to sync (with populated groups), only enabled states
    let states: LocalStateDocument[];
    const baseQuery: any = {
      ownerId: new Types.ObjectId(userId),
      countryCode: countryCode.toUpperCase(),
      enabled: { $ne: false },
    };
    if (stateIds && stateIds.length > 0) {
      baseQuery._id = { $in: stateIds.map((id) => new Types.ObjectId(id)) };
    }
    states = await this.localStateModel.find(baseQuery).populate('groups');

    if (states.length === 0) {
      throw new BadRequestException('No states found to sync');
    }

    // Get groups for this country
    const groups = await this.stateGroupModel.find({
      ownerId: new Types.ObjectId(userId),
      countryCode: countryCode.toUpperCase(),
    });

    // Format groups for sync
    const groupsToSync = groups.map((g) => ({
      name: g.name,
      color: g.color,
      description: g.description,
    }));

    // Format states for bulk update (include group names)
    const statesToSync = states.map((s) => ({
      code: s.stateCode,
      name: s.stateName,
      groups: (s.groups as any[]).map((g) => g.name), // Group names for WooCommerce
    }));

    // Call shipping service to sync
    try {
      const result = await this.shippingService.bulkUpdateStates(
        storeId,
        userId,
        countryCode.toUpperCase(),
        statesToSync,
        groupsToSync,
      );
      return {
        success: true,
        synced: states.length,
        groupsSynced: result.groups_synced || groups.length,
        message: `Successfully synced ${states.length} states and ${groups.length} groups to store`,
      };
    } catch (error) {
      this.logger.error(`Failed to sync states to store: ${error.message}`);
      throw new BadRequestException(`Failed to sync states: ${error.message}`);
    }
  }

  // ============== CSV EXPORT/IMPORT ==============

  async exportStatesToCsv(
    userId: string,
    countryCode: string,
  ): Promise<string> {
    const states = await this.localStateModel
      .find({
        ownerId: new Types.ObjectId(userId),
        countryCode: countryCode.toUpperCase(),
      })
      .populate('groups')
      .sort({ order: 1, stateName: 1 });

    const headers = [
      'Country Code',
      'State Code',
      'State Name',
      'Original Name',
      'Groups',
      'Type',
      'Enabled',
      'Order',
      'Notes',
    ];

    const rows = states.map((state) => [
      state.countryCode,
      state.stateCode,
      state.stateName || '',
      state.originalName || '',
      (state.groups as any[]).map((g) => g.name).join('; '),
      state.isNew ? 'New' : 'Override',
      state.enabled !== false ? 'Yes' : 'No',
      state.order ?? 0,
      state.notes || '',
    ]);

    const escapeValue = (val: any): string => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const BOM = '\uFEFF';
    const csvContent =
      BOM +
      [
        headers.map(escapeValue).join(','),
        ...rows.map((row) => row.map(escapeValue).join(',')),
      ].join('\n');

    return csvContent;
  }

  async importStatesFromCsv(
    userId: string,
    countryCode: string,
    csvContent: string,
  ): Promise<{
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors: { row: number; error: string }[];
  }> {
    const upperCountry = countryCode.toUpperCase();
    const content = csvContent.replace(/^\uFEFF/, '');
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV file must have at least a header row and one data row',
      );
    }

    const headerLine = this.parseCsvLine(lines[0]);
    const headerMap = new Map<string, number>();
    headerLine.forEach((h, i) => headerMap.set(h.trim().toLowerCase(), i));

    // Validate required headers
    const stateCodeIdx = headerMap.get('state code');
    const stateNameIdx = headerMap.get('state name');
    if (stateCodeIdx === undefined || stateNameIdx === undefined) {
      throw new BadRequestException(
        'CSV must contain "State Code" and "State Name" columns',
      );
    }

    const countryCodeIdx = headerMap.get('country code');
    const originalNameIdx = headerMap.get('original name');
    const groupsIdx = headerMap.get('groups');
    const typeIdx = headerMap.get('type');
    const enabledIdx = headerMap.get('enabled');
    const orderIdx = headerMap.get('order');
    const notesIdx = headerMap.get('notes');

    // Pre-load existing groups
    const existingGroups = await this.stateGroupModel.find({
      ownerId: new Types.ObjectId(userId),
      countryCode: upperCountry,
    });
    const groupMap = new Map<string, Types.ObjectId>();
    for (const g of existingGroups) {
      groupMap.set(g.name.toLowerCase(), g._id);
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const fields = this.parseCsvLine(lines[i]);
        const stateCode = fields[stateCodeIdx]?.trim();
        const stateName = fields[stateNameIdx]?.trim();

        if (!stateCode || !stateName) {
          errors.push({
            row: i + 1,
            error: 'State Code and State Name are required',
          });
          failed++;
          continue;
        }

        // Validate country code if column exists
        if (countryCodeIdx !== undefined) {
          const rowCountry = fields[countryCodeIdx]?.trim().toUpperCase();
          if (rowCountry && rowCountry !== upperCountry) {
            errors.push({
              row: i + 1,
              error: `Country code "${rowCountry}" does not match selected country "${upperCountry}"`,
            });
            failed++;
            continue;
          }
        }

        // Resolve groups
        const groupIds: Types.ObjectId[] = [];
        if (groupsIdx !== undefined && fields[groupsIdx]?.trim()) {
          const groupNames = fields[groupsIdx]
            .split(';')
            .map((n) => n.trim())
            .filter(Boolean);
          for (const gName of groupNames) {
            const key = gName.toLowerCase();
            if (groupMap.has(key)) {
              groupIds.push(groupMap.get(key));
            } else {
              // Auto-create group
              const newGroup = new this.stateGroupModel({
                name: gName,
                countryCode: upperCountry,
                color: '#3B82F6',
                ownerId: new Types.ObjectId(userId),
              });
              await newGroup.save();
              groupMap.set(key, newGroup._id);
              groupIds.push(newGroup._id);
            }
          }
        }

        const isNew =
          typeIdx !== undefined
            ? fields[typeIdx]?.trim().toLowerCase() === 'new'
            : false;
        const enabled =
          enabledIdx !== undefined
            ? fields[enabledIdx]?.trim().toLowerCase() !== 'no'
            : true;
        const order =
          orderIdx !== undefined
            ? parseInt(fields[orderIdx]?.trim(), 10) || 0
            : 0;
        const originalName =
          originalNameIdx !== undefined
            ? fields[originalNameIdx]?.trim() || ''
            : '';
        const notes =
          notesIdx !== undefined ? fields[notesIdx]?.trim() || '' : '';

        // Upsert: find by owner + countryCode + stateCode
        const existing = await this.localStateModel.findOne({
          ownerId: new Types.ObjectId(userId),
          countryCode: upperCountry,
          stateCode,
        });

        if (existing) {
          existing.stateName = stateName;
          if (originalName) existing.originalName = originalName;
          existing.groups = groupIds as any;
          existing.isNew = isNew;
          existing.enabled = enabled;
          existing.order = order;
          if (notes) existing.notes = notes;
          await existing.save();
          updated++;
        } else {
          const state = new this.localStateModel({
            countryCode: upperCountry,
            stateCode,
            stateName,
            originalName: originalName || undefined,
            groups: groupIds,
            isNew,
            enabled,
            order,
            notes: notes || undefined,
            ownerId: new Types.ObjectId(userId),
          });
          await state.save();
          created++;
        }
      } catch (error) {
        errors.push({ row: i + 1, error: error.message });
        failed++;
      }
    }

    return { total: lines.length - 1, created, updated, failed, errors };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  // ============== IMPORT FROM WOOCOMMERCE ==============

  async importFromWooCommerce(
    userId: string,
    storeId: string,
    countryCode: string,
  ): Promise<{ imported: number; states: LocalStateDocument[] }> {
    // Get states from WooCommerce via shipping service
    const wcStates = await this.shippingService.getCountryStates(
      storeId,
      userId,
      countryCode.toUpperCase(),
    );

    if (!wcStates.states || wcStates.states.length === 0) {
      return { imported: 0, states: [] };
    }

    // Import each state
    const imported: LocalStateDocument[] = [];
    for (const wcState of wcStates.states) {
      const existing = await this.localStateModel.findOne({
        ownerId: new Types.ObjectId(userId),
        countryCode: countryCode.toUpperCase(),
        stateCode: wcState.code,
      });

      if (!existing) {
        const state = new this.localStateModel({
          countryCode: countryCode.toUpperCase(),
          stateCode: wcState.code,
          stateName: wcState.name,
          originalName: wcState.name,
          isNew: false,
          ownerId: new Types.ObjectId(userId),
        });
        await state.save();
        imported.push(state);
      }
    }

    return { imported: imported.length, states: imported };
  }
}
