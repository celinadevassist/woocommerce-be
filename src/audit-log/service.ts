import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument, AuditAction, AuditSeverity } from './schema';

export interface CreateAuditLogDto {
  organizationId?: string;
  storeId?: string;
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  severity?: AuditSeverity;
  description: string;
  metadata?: Record<string, any>;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogQueryDto {
  organizationId?: string;
  storeId?: string;
  userId?: string;
  action?: AuditAction | AuditAction[];
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Create an audit log entry
   */
  async log(data: CreateAuditLogDto): Promise<AuditLogDocument> {
    try {
      const auditLog = await this.auditLogModel.create({
        organizationId: data.organizationId
          ? new Types.ObjectId(data.organizationId)
          : undefined,
        storeId: data.storeId
          ? new Types.ObjectId(data.storeId)
          : undefined,
        userId: data.userId
          ? new Types.ObjectId(data.userId)
          : undefined,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId
          ? new Types.ObjectId(data.resourceId)
          : undefined,
        resourceName: data.resourceName,
        severity: data.severity || AuditSeverity.INFO,
        description: data.description,
        metadata: data.metadata,
        previousValues: data.previousValues,
        newValues: data.newValues,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });

      return auditLog;
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      // Don't throw - audit logging should not break the main flow
      return null;
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(query: AuditLogQueryDto): Promise<{
    logs: AuditLogDocument[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  }> {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.organizationId) {
      filter.organizationId = new Types.ObjectId(query.organizationId);
    }

    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }

    if (query.userId) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    if (query.action) {
      if (Array.isArray(query.action)) {
        filter.action = { $in: query.action };
      } else {
        filter.action = query.action;
      }
    }

    if (query.resourceType) {
      filter.resourceType = query.resourceType;
    }

    if (query.resourceId) {
      filter.resourceId = new Types.ObjectId(query.resourceId);
    }

    if (query.severity) {
      filter.severity = query.severity;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) {
        filter.createdAt.$gte = query.startDate;
      }
      if (query.endDate) {
        filter.createdAt.$lte = query.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return {
      logs: logs as AuditLogDocument[],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit logs for an organization
   */
  async getOrganizationAuditLogs(
    organizationId: string,
    options?: Partial<AuditLogQueryDto>,
  ) {
    return this.getAuditLogs({
      ...options,
      organizationId,
    });
  }

  /**
   * Get audit logs for a store
   */
  async getStoreAuditLogs(
    storeId: string,
    options?: Partial<AuditLogQueryDto>,
  ) {
    return this.getAuditLogs({
      ...options,
      storeId,
    });
  }

  /**
   * Get audit logs for a user
   */
  async getUserAuditLogs(
    userId: string,
    options?: Partial<AuditLogQueryDto>,
  ) {
    return this.getAuditLogs({
      ...options,
      userId,
    });
  }

  /**
   * Get recent activity for an organization
   */
  async getRecentActivity(
    organizationId: string,
    limit: number = 10,
  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as Promise<AuditLogDocument[]>;
  }

  /**
   * Get activity summary for an organization
   */
  async getActivitySummary(
    organizationId: string,
    days: number = 30,
  ): Promise<{
    totalActions: number;
    actionBreakdown: Record<string, number>;
    userActivity: { userId: string; count: number }[];
    dailyActivity: { date: string; count: number }[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orgId = new Types.ObjectId(organizationId);

    const [actionBreakdown, userActivity, dailyActivity, totalActions] =
      await Promise.all([
        // Action breakdown
        this.auditLogModel.aggregate([
          {
            $match: {
              organizationId: orgId,
              createdAt: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: '$action',
              count: { $sum: 1 },
            },
          },
        ]),

        // User activity
        this.auditLogModel.aggregate([
          {
            $match: {
              organizationId: orgId,
              createdAt: { $gte: startDate },
              userId: { $exists: true },
            },
          },
          {
            $group: {
              _id: '$userId',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),

        // Daily activity
        this.auditLogModel.aggregate([
          {
            $match: {
              organizationId: orgId,
              createdAt: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Total count
        this.auditLogModel.countDocuments({
          organizationId: orgId,
          createdAt: { $gte: startDate },
        }),
      ]);

    return {
      totalActions,
      actionBreakdown: actionBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
      userActivity: userActivity.map((item) => ({
        userId: item._id.toString(),
        count: item.count,
      })),
      dailyActivity: dailyActivity.map((item) => ({
        date: item._id,
        count: item.count,
      })),
    };
  }

  // Convenience methods for common audit events

  async logMemberInvited(params: {
    organizationId: string;
    userId: string;
    email: string;
    role: string;
    ipAddress?: string;
  }) {
    return this.log({
      organizationId: params.organizationId,
      userId: params.userId,
      action: AuditAction.INVITATION_SENT,
      resourceType: 'invitation',
      description: `Invited ${params.email} as ${params.role}`,
      metadata: { email: params.email, role: params.role },
      ipAddress: params.ipAddress,
    });
  }

  async logMemberJoined(params: {
    organizationId: string;
    userId: string;
    email: string;
    role: string;
  }) {
    return this.log({
      organizationId: params.organizationId,
      userId: params.userId,
      action: AuditAction.MEMBER_JOINED,
      resourceType: 'member',
      resourceId: params.userId,
      description: `${params.email} joined as ${params.role}`,
      metadata: { email: params.email, role: params.role },
    });
  }

  async logStoreConnected(params: {
    organizationId: string;
    storeId: string;
    userId: string;
    storeName: string;
    storeUrl: string;
  }) {
    return this.log({
      organizationId: params.organizationId,
      storeId: params.storeId,
      userId: params.userId,
      action: AuditAction.STORE_CONNECTED,
      resourceType: 'store',
      resourceId: params.storeId,
      resourceName: params.storeName,
      description: `Connected store: ${params.storeName}`,
      metadata: { storeUrl: params.storeUrl },
    });
  }

  async logProductCreated(params: {
    organizationId: string;
    storeId: string;
    userId: string;
    productId: string;
    productName: string;
  }) {
    return this.log({
      organizationId: params.organizationId,
      storeId: params.storeId,
      userId: params.userId,
      action: AuditAction.PRODUCT_CREATED,
      resourceType: 'product',
      resourceId: params.productId,
      resourceName: params.productName,
      description: `Created product: ${params.productName}`,
    });
  }

  async logProductUpdated(params: {
    organizationId: string;
    storeId: string;
    userId: string;
    productId: string;
    productName: string;
    changes?: Record<string, any>;
  }) {
    return this.log({
      organizationId: params.organizationId,
      storeId: params.storeId,
      userId: params.userId,
      action: AuditAction.PRODUCT_UPDATED,
      resourceType: 'product',
      resourceId: params.productId,
      resourceName: params.productName,
      description: `Updated product: ${params.productName}`,
      metadata: params.changes ? { changes: Object.keys(params.changes) } : undefined,
    });
  }

  async logSync(params: {
    organizationId: string;
    storeId: string;
    userId?: string;
    resourceType: 'product' | 'order' | 'customer' | 'category' | 'attribute' | 'tag' | 'review';
    count: number;
    created?: number;
    updated?: number;
  }) {
    const actionMap = {
      product: AuditAction.PRODUCT_SYNCED,
      order: AuditAction.ORDER_SYNCED,
      customer: AuditAction.CUSTOMER_SYNCED,
      category: AuditAction.CATEGORY_SYNCED,
      attribute: AuditAction.ATTRIBUTE_SYNCED,
      tag: AuditAction.TAG_SYNCED,
      review: AuditAction.REVIEW_SYNCED,
    };

    return this.log({
      organizationId: params.organizationId,
      storeId: params.storeId,
      userId: params.userId,
      action: actionMap[params.resourceType] || AuditAction.STORE_SYNCED,
      resourceType: params.resourceType,
      description: `Synced ${params.count} ${params.resourceType}(s)`,
      metadata: {
        count: params.count,
        created: params.created,
        updated: params.updated,
      },
    });
  }
}
