import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SyncService } from './service';
import { StoreService } from '../store/service';
import { Store, StoreDocument } from '../store/schema';
import { SyncJob, SyncJobDocument } from './schema';
import { SyncJobType, SyncJobStatus, SyncEntityType } from './enum';
import { StoreStatus, SyncStatus } from '../store/enum';
import { EmailService } from '../services/email.service';

export interface SyncErrorNotification {
  storeId: string;
  storeName: string;
  entityType: string;
  error: string;
  timestamp: Date;
}

@Injectable()
export class ScheduledSyncService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledSyncService.name);
  private syncErrors: Map<string, SyncErrorNotification[]> = new Map();

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(SyncJob.name) private syncJobModel: Model<SyncJobDocument>,
    private readonly syncService: SyncService,
    private readonly storeService: StoreService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduled Sync Service initialized');
    // Clean up any stuck sync jobs on startup
    await this.cleanupStuckJobs();
  }

  /**
   * Main cron job that runs every 5 minutes to check for stores needing sync
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleScheduledSync() {
    this.logger.debug('Checking for stores due for scheduled sync...');

    try {
      // Find all active stores with autoSync enabled
      const stores = await this.storeModel.find({
        isDeleted: false,
        status: StoreStatus.ACTIVE,
        'settings.autoSync': true,
      });

      for (const store of stores) {
        await this.checkAndSyncStore(store);
      }
    } catch (error) {
      this.logger.error(`Scheduled sync check failed: ${error.message}`);
    }
  }

  /**
   * Check if a store is due for sync and trigger it
   */
  private async checkAndSyncStore(store: StoreDocument): Promise<void> {
    const syncInterval = store.settings?.syncInterval || 15; // Default 15 minutes
    const lastSync = store.lastSyncAt;
    const now = new Date();

    // Skip if synced recently
    if (lastSync) {
      const minutesSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60);
      if (minutesSinceLastSync < syncInterval) {
        return;
      }
    }

    // Check if there's already a running sync
    const runningJob = await this.syncJobModel.findOne({
      storeId: store._id,
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
    });

    if (runningJob) {
      this.logger.debug(`Store ${store.name} has a sync in progress, skipping`);
      return;
    }

    this.logger.log(`Starting scheduled sync for store: ${store.name}`);

    try {
      // Sync all entity types
      await this.runFullSync(store);
    } catch (error) {
      this.logger.error(`Scheduled sync failed for store ${store.name}: ${error.message}`);
      await this.recordSyncError(store, 'full', error.message);
    }
  }

  /**
   * Run full sync for all entity types
   */
  private async runFullSync(store: StoreDocument): Promise<void> {
    const storeId = store._id.toString();
    // Use a system user ID for scheduled syncs
    const systemUserId = 'scheduled-sync';

    const entityTypes = [
      { type: SyncEntityType.PRODUCTS, method: 'startProductSync' },
      { type: SyncEntityType.ORDERS, method: 'startOrderSync' },
      { type: SyncEntityType.CUSTOMERS, method: 'startCustomerSync' },
      { type: SyncEntityType.REVIEWS, method: 'startReviewSync' },
    ];

    for (const entity of entityTypes) {
      try {
        // Check if sync method exists and call it
        if (typeof this.syncService[entity.method] === 'function') {
          await this.syncService[entity.method](storeId, systemUserId, SyncJobType.SCHEDULED);
          // Small delay between entity syncs to avoid overwhelming the API
          await this.delay(2000);
        }
      } catch (error) {
        this.logger.error(`Scheduled ${entity.type} sync failed for ${store.name}: ${error.message}`);
        await this.recordSyncError(store, entity.type, error.message);
      }
    }

    // Update last sync timestamp
    await this.storeModel.updateOne(
      { _id: store._id },
      { lastSyncAt: new Date() },
    );
  }

  /**
   * Record sync error for notification
   */
  private async recordSyncError(
    store: StoreDocument,
    entityType: string,
    error: string,
  ): Promise<void> {
    const storeId = store._id.toString();

    if (!this.syncErrors.has(storeId)) {
      this.syncErrors.set(storeId, []);
    }

    this.syncErrors.get(storeId).push({
      storeId,
      storeName: store.name,
      entityType,
      error,
      timestamp: new Date(),
    });

    // Update store with last error
    await this.storeModel.updateOne(
      { _id: store._id },
      { lastError: `${entityType}: ${error}` },
    );
  }

  /**
   * Send sync error notifications - runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendErrorNotifications() {
    if (this.syncErrors.size === 0) {
      return;
    }

    this.logger.log('Processing sync error notifications...');

    // Group errors by store owner
    const errorsByOwner = new Map<string, SyncErrorNotification[]>();

    for (const [storeId, errors] of this.syncErrors) {
      if (errors.length === 0) continue;

      const store = await this.storeModel.findById(storeId);
      if (!store || !store.ownerId) continue;

      const ownerId = store.ownerId.toString();
      if (!errorsByOwner.has(ownerId)) {
        errorsByOwner.set(ownerId, []);
      }
      errorsByOwner.get(ownerId).push(...errors);
    }

    // Send notifications for each store owner
    for (const [ownerId, errors] of errorsByOwner) {
      await this.sendOwnerSyncErrorNotification(ownerId, errors);
    }

    // Clear processed errors
    this.syncErrors.clear();
  }

  /**
   * Send sync error notification to store owner
   */
  private async sendOwnerSyncErrorNotification(
    ownerId: string,
    errors: SyncErrorNotification[],
  ): Promise<void> {
    try {
      // Get user (store owner)
      const User = this.storeModel.db.model('User');
      const owner = await User.findById(ownerId);

      if (!owner || !owner.email) return;

      // Build error summary
      const errorSummary = errors
        .slice(0, 10) // Limit to 10 errors
        .map((e) => `- ${e.storeName} (${e.entityType}): ${e.error}`)
        .join('\n');

      const subject = `CartFlow: Sync Errors Detected`;
      const text = `
Hello,

We detected ${errors.length} sync error(s) in your CartFlow stores in the last hour:

${errorSummary}
${errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''}

Please check your store connections and credentials in the CartFlow dashboard.

If the issue persists, please contact support.

Best regards,
CartFlow Team
      `.trim();

      const html = `
<p>Hello,</p>
<p>We detected <strong>${errors.length} sync error(s)</strong> in your CartFlow stores in the last hour:</p>
<ul>
${errors.slice(0, 10).map((e) => `<li><strong>${e.storeName}</strong> (${e.entityType}): ${e.error}</li>`).join('\n')}
</ul>
${errors.length > 10 ? `<p><em>... and ${errors.length - 10} more errors</em></p>` : ''}
<p>Please check your store connections and credentials in the CartFlow dashboard.</p>
<p>If the issue persists, please contact support.</p>
<p>Best regards,<br>CartFlow Team</p>
      `.trim();

      await this.emailService.sendEmail(owner.email, subject, html);
      this.logger.log(`Sent sync error notification to ${owner.email}`);
    } catch (error) {
      this.logger.error(`Failed to send sync error notification: ${error.message}`);
    }
  }

  /**
   * Clean up stuck sync jobs on startup
   */
  private async cleanupStuckJobs(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find jobs that have been running/pending for more than 1 hour
    const stuckJobs = await this.syncJobModel.find({
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
      updatedAt: { $lt: oneHourAgo },
    });

    if (stuckJobs.length > 0) {
      this.logger.warn(`Found ${stuckJobs.length} stuck sync jobs, marking as failed`);

      for (const job of stuckJobs) {
        job.status = SyncJobStatus.FAILED;
        job.error = 'Job was stuck and has been automatically cancelled';
        job.completedAt = new Date();
        await job.save();

        // Reset store sync status
        await this.storeService.updateSyncStatus(
          job.storeId.toString(),
          job.entityType as any,
          SyncStatus.IDLE,
        );
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get scheduled sync status for a store
   */
  async getScheduledSyncStatus(storeId: string): Promise<{
    enabled: boolean;
    interval: number;
    lastSync: Date | null;
    nextSync: Date | null;
    recentErrors: SyncErrorNotification[];
  }> {
    const store = await this.storeModel.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const enabled = store.settings?.autoSync || false;
    const interval = store.settings?.syncInterval || 15;
    const lastSync = store.lastSyncAt || null;

    let nextSync: Date | null = null;
    if (enabled && lastSync) {
      nextSync = new Date(lastSync.getTime() + interval * 60 * 1000);
    } else if (enabled) {
      nextSync = new Date(); // Will sync on next cron run
    }

    const recentErrors = this.syncErrors.get(storeId) || [];

    return {
      enabled,
      interval,
      lastSync,
      nextSync,
      recentErrors,
    };
  }

  /**
   * Update scheduled sync settings for a store
   */
  async updateScheduledSyncSettings(
    storeId: string,
    settings: { autoSync?: boolean; syncInterval?: number },
  ): Promise<void> {
    await this.storeModel.updateOne(
      { _id: new Types.ObjectId(storeId) },
      {
        $set: {
          'settings.autoSync': settings.autoSync,
          ...(settings.syncInterval && { 'settings.syncInterval': settings.syncInterval }),
        },
      },
    );
  }
}
