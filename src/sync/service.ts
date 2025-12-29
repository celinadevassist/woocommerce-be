import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SyncJob, SyncJobDocument } from './schema';
import { SyncJobType, SyncJobStatus, SyncEntityType, SyncMode } from './enum';
import { ISyncJob, ISyncProgress, ISyncResult, ISyncJobsResponse } from './interface';
import { StoreService } from '../store/service';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';
import { ProductService } from '../product/service';
import { OrderService } from '../order/service';
import { CustomerService } from '../customer/service';
import { ReviewService } from '../review/service';
import { StoreStatus, SyncStatus } from '../store/enum';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly BATCH_SIZE = 100;

  /**
   * Check if a string is a valid MongoDB ObjectId
   */
  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
  }

  constructor(
    @InjectModel(SyncJob.name) private syncJobModel: Model<SyncJobDocument>,
    private readonly storeService: StoreService,
    private readonly wooCommerceService: WooCommerceService,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => CustomerService))
    private readonly customerService: CustomerService,
    @Inject(forwardRef(() => ReviewService))
    private readonly reviewService: ReviewService,
  ) {}

  /**
   * Start product sync for a store
   * @param syncMode - 'full' for all products, 'delta' for only modified since last sync
   */
  async startProductSync(
    storeId: string,
    userId: string,
    type: SyncJobType = SyncJobType.MANUAL,
    syncMode: SyncMode = SyncMode.FULL,
  ): Promise<ISyncResult> {
    const store = await this.storeService.getStoreWithCredentials(storeId);
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Check if there's already a running sync for this entity type
    const existingJob = await this.syncJobModel.findOne({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.PRODUCTS,
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
    });

    if (existingJob) {
      throw new BadRequestException('A product sync is already in progress for this store');
    }

    // For delta sync, get the last successful sync date
    let modifiedAfter: Date | undefined;
    if (syncMode === SyncMode.DELTA) {
      const lastSync = store.syncStatus?.products?.lastSync;
      if (lastSync) {
        modifiedAfter = lastSync;
      } else {
        // No previous sync - fall back to full sync
        syncMode = SyncMode.FULL;
        this.logger.log(`No previous sync found for products, falling back to full sync`);
      }
    }

    // Create sync job
    const job = await this.syncJobModel.create({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.PRODUCTS,
      type,
      status: SyncJobStatus.PENDING,
      syncMode,
      modifiedAfter,
      ...(this.isValidObjectId(userId) && { triggeredBy: new Types.ObjectId(userId) }),
    });

    // Update store sync status
    await this.storeService.updateSyncStatus(storeId, 'products', SyncStatus.SYNCING);

    // Start async sync process
    this.executeProductSync(job._id.toString(), store).catch((error) => {
      this.logger.error(`Product sync failed for job ${job._id}: ${error.message}`);
    });

    return {
      success: true,
      message: `Product ${syncMode} sync started`,
      job: this.toInterface(job),
    };
  }

  /**
   * Pause a running sync job
   */
  async pauseSync(jobId: string): Promise<ISyncResult> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }

    if (job.status !== SyncJobStatus.RUNNING) {
      throw new BadRequestException('Only running sync jobs can be paused');
    }

    job.status = SyncJobStatus.PAUSED;
    job.pausedAt = new Date();
    await job.save();

    return {
      success: true,
      message: 'Sync job paused',
      job: this.toInterface(job),
    };
  }

  /**
   * Resume a paused sync job
   */
  async resumeSync(jobId: string): Promise<ISyncResult> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }

    if (job.status !== SyncJobStatus.PAUSED) {
      throw new BadRequestException('Only paused sync jobs can be resumed');
    }

    const store = await this.storeService.getStoreWithCredentials(job.storeId.toString());
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    job.status = SyncJobStatus.RUNNING;
    job.pausedAt = undefined;
    await job.save();

    // Resume sync from where it left off
    this.executeProductSync(job._id.toString(), store).catch((error) => {
      this.logger.error(`Product sync resume failed for job ${job._id}: ${error.message}`);
    });

    return {
      success: true,
      message: 'Sync job resumed',
      job: this.toInterface(job),
    };
  }

  /**
   * Cancel a sync job
   */
  async cancelSync(jobId: string): Promise<ISyncResult> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }

    if (![SyncJobStatus.PENDING, SyncJobStatus.RUNNING, SyncJobStatus.PAUSED].includes(job.status)) {
      throw new BadRequestException('This sync job cannot be cancelled');
    }

    job.status = SyncJobStatus.CANCELLED;
    job.completedAt = new Date();
    await job.save();

    // Update store sync status
    await this.storeService.updateSyncStatus(job.storeId.toString(), 'products', SyncStatus.IDLE);

    return {
      success: true,
      message: 'Sync job cancelled',
      job: this.toInterface(job),
    };
  }

  /**
   * Get sync progress for a store - returns all active/recent jobs
   */
  async getSyncProgress(storeId: string, entityType?: SyncEntityType): Promise<{ jobs: ISyncJob[] }> {
    const filter: any = {
      storeId: new Types.ObjectId(storeId),
    };

    if (entityType) {
      filter.entityType = entityType;
    }

    // Get all jobs from the last 24 hours or still active
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const jobs = await this.syncJobModel.find({
      ...filter,
      $or: [
        { status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING, SyncJobStatus.PAUSED] } },
        { createdAt: { $gte: oneDayAgo } },
      ],
    }).sort({ createdAt: -1 }).limit(20);

    return {
      jobs: jobs.map((job) => this.toInterface(job)),
    };
  }

  /**
   * Get sync jobs for a store
   */
  async getSyncJobs(
    storeId: string,
    page: number = 1,
    size: number = 10,
  ): Promise<ISyncJobsResponse> {
    const filter = { storeId: new Types.ObjectId(storeId) };
    const skip = (page - 1) * size;

    const [jobs, total] = await Promise.all([
      this.syncJobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(size),
      this.syncJobModel.countDocuments(filter),
    ]);

    return {
      jobs: jobs.map((job) => this.toInterface(job)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single sync job
   */
  async getSyncJob(jobId: string): Promise<ISyncJob> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }
    return this.toInterface(job);
  }

  /**
   * Execute the actual product sync
   * This runs asynchronously after the job is created
   */
  private async executeProductSync(jobId: string, store: any): Promise<void> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) return;

    try {
      // Update job to running
      job.status = SyncJobStatus.RUNNING;
      job.startedAt = job.startedAt || new Date();
      await job.save();

      const credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      };

      // Convert modifiedAfter to ISO string for WooCommerce API (delta sync)
      const modifiedAfterISO = job.modifiedAfter
        ? job.modifiedAfter.toISOString()
        : undefined;

      if (modifiedAfterISO) {
        this.logger.log(`Delta sync: fetching products modified after ${modifiedAfterISO}`);
      }

      // Get first page to determine total
      const firstPage = await this.wooCommerceService.getProducts(
        credentials,
        1,
        this.BATCH_SIZE,
        modifiedAfterISO,
      );
      job.totalItems = firstPage.totalItems;
      job.totalPages = firstPage.totalPages;
      await job.save();

      this.logger.log(`Product sync: ${firstPage.totalItems} products to sync (${job.syncMode} mode)`);

      // Process from current page (supports resume)
      for (let page = job.currentPage; page <= job.totalPages; page++) {
        // Check if job was paused or cancelled
        const currentJob = await this.syncJobModel.findById(jobId);
        if (!currentJob || currentJob.status !== SyncJobStatus.RUNNING) {
          this.logger.log(`Sync job ${jobId} was paused or cancelled at page ${page}`);
          return;
        }

        // Fetch products for this page
        const productsPage = page === 1
          ? firstPage
          : await this.wooCommerceService.getProducts(credentials, page, this.BATCH_SIZE, modifiedAfterISO);

        // Process each product
        for (const wooProduct of productsPage.data) {
          try {
            // Upsert product to database
            const savedProduct = await this.productService.upsertFromWoo(
              store._id.toString(),
              wooProduct,
            );

            job.processedItems++;

            // If product has variations, sync them too
            if (wooProduct.type === 'variable' && wooProduct.variations?.length > 0) {
              try {
                for (let varPage = 1; varPage <= 50; varPage++) { // Max 50 pages safety limit
                  const variations = await this.wooCommerceService.getProductVariations(
                    credentials,
                    wooProduct.id,
                    varPage,
                    100,
                  );

                  for (const variation of variations.data) {
                    try {
                      await this.productService.upsertVariantFromWoo(
                        savedProduct._id.toString(),
                        store._id.toString(),
                        wooProduct.id,
                        variation,
                      );
                    } catch (varError) {
                      this.logger.error(`Failed to sync variation ${variation.id} for product ${wooProduct.id}: ${varError.message}`);
                    }
                  }

                  if (varPage >= variations.totalPages) break;
                  await this.delay(200); // Delay between variation pages
                }
              } catch (varError) {
                this.logger.error(`Failed to fetch variations for product ${wooProduct.id}: ${varError.message}`);
              }
            }

            job.createdItems++;
          } catch (error) {
            job.failedItems++;
            job.syncErrors.push(`Product ${wooProduct.id}: ${error.message}`);
            this.logger.error(`Failed to sync product ${wooProduct.id}: ${error.message}`);
          }
        }

        job.currentPage = page + 1;
        await job.save();

        // Delay between pages to prevent rate limiting (500ms)
        await this.delay(500);
      }

      // Mark as completed
      job.status = SyncJobStatus.COMPLETED;
      job.completedAt = new Date();
      await job.save();

      // Update store sync status
      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'products',
        SyncStatus.SYNCED,
        job.processedItems,
      );

      // Update store last sync timestamp
      await this.storeService.updateStatus(store._id.toString(), StoreStatus.ACTIVE);

      this.logger.log(`Product sync completed for store ${store._id}: ${job.processedItems} products synced`);
    } catch (error) {
      this.logger.error(`Product sync failed for job ${jobId}: ${error.message}`);

      job.status = SyncJobStatus.FAILED;
      job.error = error.message;
      job.completedAt = new Date();
      await job.save();

      // Update store sync status
      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'products',
        SyncStatus.ERROR,
        undefined,
        error.message,
      );
    }
  }

  /**
   * Start order sync for a store
   * @param syncMode - 'full' for all orders, 'delta' for only modified since last sync
   */
  async startOrderSync(
    storeId: string,
    userId: string,
    type: SyncJobType = SyncJobType.MANUAL,
    syncMode: SyncMode = SyncMode.FULL,
  ): Promise<ISyncResult> {
    const store = await this.storeService.getStoreWithCredentials(storeId);
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const existingJob = await this.syncJobModel.findOne({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.ORDERS,
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
    });

    if (existingJob) {
      throw new BadRequestException('An order sync is already in progress for this store');
    }

    // For delta sync, get the last successful sync date
    let modifiedAfter: Date | undefined;
    if (syncMode === SyncMode.DELTA) {
      const lastSync = store.syncStatus?.orders?.lastSync;
      if (lastSync) {
        modifiedAfter = lastSync;
      } else {
        // No previous sync - fall back to full sync
        syncMode = SyncMode.FULL;
        this.logger.log(`No previous sync found for orders, falling back to full sync`);
      }
    }

    const job = await this.syncJobModel.create({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.ORDERS,
      type,
      status: SyncJobStatus.PENDING,
      syncMode,
      modifiedAfter,
      ...(this.isValidObjectId(userId) && { triggeredBy: new Types.ObjectId(userId) }),
    });

    await this.storeService.updateSyncStatus(storeId, 'orders', SyncStatus.SYNCING);

    this.executeOrderSync(job._id.toString(), store).catch((error) => {
      this.logger.error(`Order sync failed for job ${job._id}: ${error.message}`);
    });

    return {
      success: true,
      message: `Order ${syncMode} sync started`,
      job: this.toInterface(job),
    };
  }

  /**
   * Execute order sync
   */
  private async executeOrderSync(jobId: string, store: any): Promise<void> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) return;

    try {
      job.status = SyncJobStatus.RUNNING;
      job.startedAt = job.startedAt || new Date();
      await job.save();

      const credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      };

      // Convert modifiedAfter to ISO string for WooCommerce API (delta sync)
      const modifiedAfterISO = job.modifiedAfter
        ? job.modifiedAfter.toISOString()
        : undefined;

      if (modifiedAfterISO) {
        this.logger.log(`Delta sync: fetching orders modified after ${modifiedAfterISO}`);
      }

      const firstPage = await this.wooCommerceService.getOrders(
        credentials,
        1,
        this.BATCH_SIZE,
        undefined, // status
        modifiedAfterISO,
      );
      job.totalItems = firstPage.totalItems;
      job.totalPages = firstPage.totalPages;
      await job.save();

      this.logger.log(`Order sync: ${firstPage.totalItems} orders to sync (${job.syncMode} mode)`);

      for (let page = job.currentPage; page <= job.totalPages; page++) {
        const currentJob = await this.syncJobModel.findById(jobId);
        if (!currentJob || currentJob.status !== SyncJobStatus.RUNNING) {
          this.logger.log(`Order sync job ${jobId} was paused or cancelled at page ${page}`);
          return;
        }

        const ordersPage = page === 1
          ? firstPage
          : await this.wooCommerceService.getOrders(credentials, page, this.BATCH_SIZE, undefined, modifiedAfterISO);

        for (const wooOrder of ordersPage.data) {
          try {
            await this.orderService.upsertFromWoo(
              store._id.toString(),
              wooOrder,
            );
            job.processedItems++;
            job.createdItems++;
          } catch (error) {
            job.failedItems++;
            job.syncErrors.push(`Order ${wooOrder.id}: ${error.message}`);
            this.logger.error(`Failed to sync order ${wooOrder.id}: ${error.message}`);
          }
        }

        job.currentPage = page + 1;
        await job.save();
        await this.delay(500);
      }

      job.status = SyncJobStatus.COMPLETED;
      job.completedAt = new Date();
      await job.save();

      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'orders',
        SyncStatus.SYNCED,
        job.processedItems,
      );

      this.logger.log(`Order sync completed for store ${store._id}: ${job.processedItems} orders synced`);
    } catch (error) {
      this.logger.error(`Order sync failed for job ${jobId}: ${error.message}`);
      job.status = SyncJobStatus.FAILED;
      job.error = error.message;
      job.completedAt = new Date();
      await job.save();

      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'orders',
        SyncStatus.ERROR,
        undefined,
        error.message,
      );
    }
  }

  /**
   * Start customer sync for a store
   */
  async startCustomerSync(
    storeId: string,
    userId: string,
    type: SyncJobType = SyncJobType.MANUAL,
  ): Promise<ISyncResult> {
    const store = await this.storeService.getStoreWithCredentials(storeId);
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const existingJob = await this.syncJobModel.findOne({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.CUSTOMERS,
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
    });

    if (existingJob) {
      throw new BadRequestException('A customer sync is already in progress for this store');
    }

    const job = await this.syncJobModel.create({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.CUSTOMERS,
      type,
      status: SyncJobStatus.PENDING,
      ...(this.isValidObjectId(userId) && { triggeredBy: new Types.ObjectId(userId) }),
    });

    await this.storeService.updateSyncStatus(storeId, 'customers', SyncStatus.SYNCING);

    this.executeCustomerSync(job._id.toString(), store).catch((error) => {
      this.logger.error(`Customer sync failed for job ${job._id}: ${error.message}`);
    });

    return {
      success: true,
      message: 'Customer sync started',
      job: this.toInterface(job),
    };
  }

  /**
   * Execute customer sync
   */
  private async executeCustomerSync(jobId: string, store: any): Promise<void> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) return;

    try {
      job.status = SyncJobStatus.RUNNING;
      job.startedAt = job.startedAt || new Date();
      await job.save();

      const credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      };

      const firstPage = await this.wooCommerceService.getCustomers(credentials, 1, this.BATCH_SIZE);
      job.totalItems = firstPage.totalItems;
      job.totalPages = firstPage.totalPages;
      await job.save();

      for (let page = job.currentPage; page <= job.totalPages; page++) {
        const currentJob = await this.syncJobModel.findById(jobId);
        if (!currentJob || currentJob.status !== SyncJobStatus.RUNNING) {
          this.logger.log(`Customer sync job ${jobId} was paused or cancelled at page ${page}`);
          return;
        }

        const customersPage = page === 1 ? firstPage : await this.wooCommerceService.getCustomers(credentials, page, this.BATCH_SIZE);

        for (const wooCustomer of customersPage.data) {
          try {
            await this.customerService.upsertFromWoo(
              store._id.toString(),
              wooCustomer,
            );
            job.processedItems++;
            job.createdItems++;
          } catch (error) {
            job.failedItems++;
            job.syncErrors.push(`Customer ${wooCustomer.id}: ${error.message}`);
            this.logger.error(`Failed to sync customer ${wooCustomer.id}: ${error.message}`);
          }
        }

        job.currentPage = page + 1;
        await job.save();
        await this.delay(500);
      }

      job.status = SyncJobStatus.COMPLETED;
      job.completedAt = new Date();
      await job.save();

      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'customers',
        SyncStatus.SYNCED,
        job.processedItems,
      );

      this.logger.log(`Customer sync completed for store ${store._id}: ${job.processedItems} customers synced`);
    } catch (error) {
      this.logger.error(`Customer sync failed for job ${jobId}: ${error.message}`);
      job.status = SyncJobStatus.FAILED;
      job.error = error.message;
      job.completedAt = new Date();
      await job.save();

      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'customers',
        SyncStatus.ERROR,
        undefined,
        error.message,
      );
    }
  }

  /**
   * Start review sync for a store
   */
  async startReviewSync(
    storeId: string,
    userId: string,
    type: SyncJobType = SyncJobType.MANUAL,
  ): Promise<ISyncResult> {
    const store = await this.storeService.getStoreWithCredentials(storeId);
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const existingJob = await this.syncJobModel.findOne({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.REVIEWS,
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
    });

    if (existingJob) {
      throw new BadRequestException('A review sync is already in progress for this store');
    }

    const job = await this.syncJobModel.create({
      storeId: new Types.ObjectId(storeId),
      entityType: SyncEntityType.REVIEWS,
      type,
      status: SyncJobStatus.PENDING,
      ...(this.isValidObjectId(userId) && { triggeredBy: new Types.ObjectId(userId) }),
    });

    await this.storeService.updateSyncStatus(storeId, 'reviews', SyncStatus.SYNCING);

    this.executeReviewSync(job._id.toString(), store).catch((error) => {
      this.logger.error(`Review sync failed for job ${job._id}: ${error.message}`);
    });

    return {
      success: true,
      message: 'Review sync started',
      job: this.toInterface(job),
    };
  }

  /**
   * Execute review sync
   */
  private async executeReviewSync(jobId: string, store: any): Promise<void> {
    const job = await this.syncJobModel.findById(jobId);
    if (!job) return;

    try {
      job.status = SyncJobStatus.RUNNING;
      job.startedAt = job.startedAt || new Date();
      await job.save();

      const credentials = {
        url: store.url,
        consumerKey: store.credentials.consumerKey,
        consumerSecret: store.credentials.consumerSecret,
      };

      const firstPage = await this.wooCommerceService.getReviews(credentials, 1, this.BATCH_SIZE);
      job.totalItems = firstPage.totalItems;
      job.totalPages = firstPage.totalPages;
      await job.save();

      for (let page = job.currentPage; page <= job.totalPages; page++) {
        const currentJob = await this.syncJobModel.findById(jobId);
        if (!currentJob || currentJob.status !== SyncJobStatus.RUNNING) {
          this.logger.log(`Review sync job ${jobId} was paused or cancelled at page ${page}`);
          return;
        }

        const reviewsPage = page === 1 ? firstPage : await this.wooCommerceService.getReviews(credentials, page, this.BATCH_SIZE);

        for (const wooReview of reviewsPage.data) {
          try {
            await this.reviewService.upsertFromWoo(
              store._id.toString(),
              wooReview,
            );
            job.processedItems++;
            job.createdItems++;
          } catch (error) {
            job.failedItems++;
            job.syncErrors.push(`Review ${wooReview.id}: ${error.message}`);
            this.logger.error(`Failed to sync review ${wooReview.id}: ${error.message}`);
          }
        }

        job.currentPage = page + 1;
        await job.save();
        await this.delay(500);
      }

      job.status = SyncJobStatus.COMPLETED;
      job.completedAt = new Date();
      await job.save();

      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'reviews',
        SyncStatus.SYNCED,
        job.processedItems,
      );

      this.logger.log(`Review sync completed for store ${store._id}: ${job.processedItems} reviews synced`);
    } catch (error) {
      this.logger.error(`Review sync failed for job ${jobId}: ${error.message}`);
      job.status = SyncJobStatus.FAILED;
      job.error = error.message;
      job.completedAt = new Date();
      await job.save();

      await this.storeService.updateSyncStatus(
        store._id.toString(),
        'reviews',
        SyncStatus.ERROR,
        undefined,
        error.message,
      );
    }
  }

  /**
   * Reset stuck sync jobs (all running/pending jobs for this store)
   */
  async resetStuckJobs(storeId: string): Promise<{ reset: number }> {
    const result = await this.syncJobModel.updateMany(
      {
        storeId: new Types.ObjectId(storeId),
        status: { $in: [SyncJobStatus.RUNNING, SyncJobStatus.PENDING, SyncJobStatus.PAUSED] },
      },
      {
        $set: {
          status: SyncJobStatus.CANCELLED,
          error: 'Job cancelled by user',
          completedAt: new Date(),
        },
      },
    );

    // Also reset store sync status
    await this.storeService.updateSyncStatus(storeId, 'products', SyncStatus.IDLE);
    await this.storeService.updateSyncStatus(storeId, 'orders', SyncStatus.IDLE);
    await this.storeService.updateSyncStatus(storeId, 'customers', SyncStatus.IDLE);
    await this.storeService.updateSyncStatus(storeId, 'reviews', SyncStatus.IDLE);

    return { reset: result.modifiedCount };
  }

  /**
   * Start sync for all entity types
   * @param syncMode - 'full' for all records, 'delta' for only modified since last sync
   */
  async startFullSync(
    storeId: string,
    userId: string,
    syncMode: SyncMode = SyncMode.FULL,
  ): Promise<{ jobs: ISyncResult[] }> {
    const results: ISyncResult[] = [];

    try {
      // Products and Orders support delta sync
      results.push(await this.startProductSync(storeId, userId, SyncJobType.MANUAL, syncMode));
    } catch (error) {
      results.push({ success: false, message: `Products: ${error.message}` });
    }

    try {
      results.push(await this.startOrderSync(storeId, userId, SyncJobType.MANUAL, syncMode));
    } catch (error) {
      results.push({ success: false, message: `Orders: ${error.message}` });
    }

    try {
      // Customers don't support delta sync in WooCommerce API - always full sync
      results.push(await this.startCustomerSync(storeId, userId, SyncJobType.MANUAL));
    } catch (error) {
      results.push({ success: false, message: `Customers: ${error.message}` });
    }

    try {
      // Reviews don't support delta sync in WooCommerce API - always full sync
      results.push(await this.startReviewSync(storeId, userId, SyncJobType.MANUAL));
    } catch (error) {
      results.push({ success: false, message: `Reviews: ${error.message}` });
    }

    return { jobs: results };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toInterface(doc: SyncJobDocument): ISyncJob {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      entityType: obj.entityType,
      type: obj.type,
      status: obj.status,
      syncMode: obj.syncMode || SyncMode.FULL,
      modifiedAfter: obj.modifiedAfter,
      totalItems: obj.totalItems,
      processedItems: obj.processedItems,
      createdItems: obj.createdItems,
      updatedItems: obj.updatedItems,
      skippedItems: obj.skippedItems,
      failedItems: obj.failedItems,
      currentPage: obj.currentPage,
      totalPages: obj.totalPages,
      startedAt: obj.startedAt,
      pausedAt: obj.pausedAt,
      completedAt: obj.completedAt,
      error: obj.error,
      errors: obj.syncErrors || [],
      triggeredBy: obj.triggeredBy?.toString(),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
