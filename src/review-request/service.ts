import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { ReviewRequest, ReviewRequestDocument } from './schema';
import { ReviewRequestSettings, ReviewRequestSettingsDocument } from './settings.schema';
import { QueryReviewRequestDto, UpdateReviewRequestSettingsDto, SubmitReviewsDto } from './dto';
import {
  IReviewRequest,
  IReviewRequestSettings,
  IReviewRequestResponse,
  IReviewRequestStats,
  IPublicReviewRequest,
} from './interface';
import { ReviewRequestStatus, ReviewRequestChannel, ReviewRequestTrigger } from './enum';
import { Store, StoreDocument } from '../store/schema';
import { Order, OrderDocument } from '../order/schema';
import { ReviewService } from '../review/service';
import { ReviewSource, ReviewType, ModerationStatus } from '../review/enum';
import { SMSService } from '../services/sms.service';

@Injectable()
export class ReviewRequestService {
  private readonly logger = new Logger(ReviewRequestService.name);

  constructor(
    @InjectModel(ReviewRequest.name) private reviewRequestModel: Model<ReviewRequestDocument>,
    @InjectModel(ReviewRequestSettings.name) private settingsModel: Model<ReviewRequestSettingsDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private readonly reviewService: ReviewService,
    private readonly smsService: SMSService,
  ) {}

  /**
   * Get all store IDs the user has access to
   */
  private async getUserStoreIds(userId: string): Promise<Types.ObjectId[]> {
    const stores = await this.storeModel.find({
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    }).select('_id');
    return stores.map((store) => store._id);
  }

  /**
   * Verify user has access to a specific store
   */
  private async verifyStoreAccess(storeId: string, userId: string): Promise<StoreDocument> {
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const isOwner = store.ownerId.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  // ==================== SETTINGS MANAGEMENT ====================

  /**
   * Get settings for a store (creates default if not exists)
   */
  async getSettings(storeId: string, userId: string): Promise<IReviewRequestSettings> {
    await this.verifyStoreAccess(storeId, userId);

    let settings = await this.settingsModel.findOne({
      storeId: new Types.ObjectId(storeId),
    });

    if (!settings) {
      // Create default settings
      settings = await this.settingsModel.create({
        storeId: new Types.ObjectId(storeId),
        enabled: false,
        triggerOn: ReviewRequestTrigger.DELIVERED,
        delayHours: 24,
        linkExpirationDays: 14,
        channel: ReviewRequestChannel.SMS,
        sendReminders: true,
        reminderDelayDays: 3,
        maxReminders: 2,
      });
    }

    return this.settingsToInterface(settings);
  }

  /**
   * Update settings for a store
   */
  async updateSettings(
    storeId: string,
    userId: string,
    dto: UpdateReviewRequestSettingsDto,
  ): Promise<IReviewRequestSettings> {
    await this.verifyStoreAccess(storeId, userId);

    let settings = await this.settingsModel.findOne({
      storeId: new Types.ObjectId(storeId),
    });

    if (!settings) {
      settings = new this.settingsModel({
        storeId: new Types.ObjectId(storeId),
      });
    }

    // Update fields
    Object.keys(dto).forEach((key) => {
      if (dto[key] !== undefined) {
        settings[key] = dto[key];
      }
    });

    await settings.save();
    this.logger.log(`Review request settings updated for store ${storeId}`);

    return this.settingsToInterface(settings);
  }

  // ==================== REVIEW REQUEST MANAGEMENT ====================

  /**
   * Get review requests with filtering and pagination
   */
  async findAll(userId: string, query: QueryReviewRequestDto): Promise<IReviewRequestResponse> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (query.storeId) {
      filter.storeId = new Types.ObjectId(query.storeId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.customerPhone) {
      filter.customerPhone = { $regex: query.customerPhone, $options: 'i' };
    }
    if (query.orderNumber) {
      filter.orderNumber = { $regex: query.orderNumber, $options: 'i' };
    }
    // Keyword search - searches in customer name, phone, and order number
    if (query.keyword) {
      filter.$or = [
        { customerName: { $regex: query.keyword, $options: 'i' } },
        { customerPhone: { $regex: query.keyword, $options: 'i' } },
        { orderNumber: { $regex: query.keyword, $options: 'i' } },
      ];
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    // Build sort object
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [requests, total] = await Promise.all([
      this.reviewRequestModel.find(filter).sort(sort).skip(skip).limit(size),
      this.reviewRequestModel.countDocuments(filter),
    ]);

    return {
      requests: requests.map((r) => this.toInterface(r)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get a single review request by ID
   */
  async findById(id: string, userId: string): Promise<IReviewRequest> {
    const request = await this.reviewRequestModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    await this.verifyStoreAccess(request.storeId.toString(), userId);

    return this.toInterface(request);
  }

  /**
   * Get statistics for review requests
   */
  async getStats(userId: string, storeId?: string): Promise<IReviewRequestStats> {
    const storeIds = await this.getUserStoreIds(userId);

    const filter: any = {
      storeId: { $in: storeIds },
      isDeleted: false,
    };

    if (storeId) {
      filter.storeId = new Types.ObjectId(storeId);
    }

    const [total, statusCounts] = await Promise.all([
      this.reviewRequestModel.countDocuments(filter),
      this.reviewRequestModel.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = {
      pending: 0,
      sent: 0,
      opened: 0,
      partial: 0,
      completed: 0,
      expired: 0,
    };

    statusCounts.forEach((item: any) => {
      counts[item._id] = item.count;
    });

    const sentTotal = counts.sent + counts.opened + counts.partial + counts.completed;
    const respondedTotal = counts.partial + counts.completed;

    return {
      total,
      ...counts,
      conversionRate: sentTotal > 0 ? Math.round((respondedTotal / sentTotal) * 100) : 0,
      openRate: sentTotal > 0 ? Math.round(((counts.opened + respondedTotal) / sentTotal) * 100) : 0,
    };
  }

  // ==================== SCHEDULING & SENDING ====================

  /**
   * Schedule a review request for an order
   * Called when an order reaches the trigger status (delivered/completed)
   */
  async scheduleRequest(orderId: string, trigger?: string, skipSettingsCheck = false): Promise<ReviewRequestDocument | null> {
    this.logger.log(`[scheduleRequest] Starting for orderId: ${orderId}, skipSettingsCheck: ${skipSettingsCheck}`);

    try {
      const order = await this.orderModel.findOne({
        _id: new Types.ObjectId(orderId),
        isDeleted: false,
      });
      this.logger.log(`[scheduleRequest] Order lookup complete`);

      if (!order) {
        this.logger.warn(`Order ${orderId} not found for review request`);
        return null;
      }

      // Check if request already exists
      const existingRequest = await this.reviewRequestModel.findOne({
        orderId: new Types.ObjectId(orderId),
      });
      this.logger.log(`[scheduleRequest] Existing request check complete`);

      if (existingRequest) {
        this.logger.log(`Review request already exists for order ${orderId}`);
        return null;
      }

      // Get settings
      this.logger.log(`[scheduleRequest] Getting settings for store: ${order.storeId}`);
      const settings = await this.settingsModel.findOne({
        storeId: new Types.ObjectId(order.storeId.toString()),
      });
      this.logger.log(`[scheduleRequest] Settings: ${settings ? 'found' : 'not found'}`);

      if (!skipSettingsCheck) {
        if (!settings || !settings.enabled) {
          this.logger.log(`Review requests disabled for store ${order.storeId}`);
          return null;
        }

        // Check if trigger matches settings
        if (trigger && settings.triggerOn && trigger !== settings.triggerOn) {
          this.logger.log(`Review request trigger mismatch: ${trigger} !== ${settings.triggerOn}`);
          return null;
        }
      }

      // Default settings values for manual trigger or missing settings
      const delayHours = settings?.delayHours ?? 0;
      const linkExpirationDays = settings?.linkExpirationDays ?? 14;
      this.logger.log(`[scheduleRequest] Using delayHours: ${delayHours}, linkExpirationDays: ${linkExpirationDays}`);

      // Check order value filter (only if settings exist)
      if (settings?.excludeOrdersBelow && parseFloat(order.total) < settings.excludeOrdersBelow) {
        this.logger.log(`Order ${orderId} excluded - value below threshold`);
        return null;
      }

      // Check customer phone
      if (!order.billing?.phone) {
        this.logger.warn(`Order ${orderId} has no customer phone`);
        return null;
      }
      this.logger.log(`[scheduleRequest] Customer phone: ${order.billing.phone}`);

      // Helper to check if a value is a valid MongoDB ObjectId
      const isValidObjectId = (value: any): boolean => {
        if (!value) return false;
        if (typeof value === 'number') return false;
        const str = value.toString();
        return /^[a-fA-F0-9]{24}$/.test(str);
      };

      // Build items from order - filter out items without names
      const items = (order.lineItems || [])
        .filter((item: any) => item.name) // Skip items without names
        .map((item: any) => ({
          productId: isValidObjectId(item.productId) ? item.productId : undefined,
          productName: item.name,
          productSku: item.sku,
          productImage: item.image,
          quantity: item.quantity || 1,
          reviewed: false,
        }));
      this.logger.log(`[scheduleRequest] Items count: ${items.length}`);

      if (items.length === 0) {
        this.logger.warn(`Order ${orderId} has no line items`);
        return null;
      }

      // Generate token and schedule
      const token = this.generateToken();
      const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      const tokenExpiresAt = new Date(scheduledFor.getTime() + linkExpirationDays * 24 * 60 * 60 * 1000);

      const requestData = {
        storeId: order.storeId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerId: isValidObjectId(order.customerId) ? order.customerId : undefined,
        customerName: order.billing?.firstName
          ? `${order.billing.firstName} ${order.billing.lastName || ''}`.trim()
          : 'Customer',
        customerPhone: order.billing.phone,
        customerEmail: order.billing?.email,
        items,
        token,
        tokenExpiresAt,
        status: ReviewRequestStatus.PENDING,
        scheduledFor,
        delayHours,
        expirationDays: linkExpirationDays,
      };

      this.logger.log(`[scheduleRequest] Token generated, creating request with data: ${JSON.stringify({
        storeId: requestData.storeId?.toString(),
        orderId: requestData.orderId?.toString(),
        orderNumber: requestData.orderNumber,
        customerName: requestData.customerName,
        itemsCount: requestData.items?.length,
      })}`);

      let request;
      try {
        console.log('[scheduleRequest] About to call reviewRequestModel.create...');
        request = await this.reviewRequestModel.create(requestData);
        console.log('[scheduleRequest] Create completed successfully');
      } catch (createError) {
        console.error('[scheduleRequest] Create failed:', createError);
        this.logger.error(`[scheduleRequest] Create failed: ${createError.message}`, createError.stack);
        throw createError;
      }

      this.logger.log(`[scheduleRequest] Request created: ${request._id}`);
      return request;
    } catch (error) {
      this.logger.error(`[scheduleRequest] Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Send pending review requests that are due
   * Called by scheduled job
   */
  async processPendingRequests(): Promise<{ processed: number; sent: number; errors: number }> {
    const now = new Date();

    const pendingRequests = await this.reviewRequestModel.find({
      status: ReviewRequestStatus.PENDING,
      scheduledFor: { $lte: now },
      isDeleted: false,
    }).limit(100);

    let sent = 0;
    let errors = 0;

    for (const request of pendingRequests) {
      try {
        await this.sendRequest(request);
        sent++;
      } catch (error) {
        this.logger.error(`Failed to send request ${request._id}: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Processed ${pendingRequests.length} pending requests: ${sent} sent, ${errors} errors`);

    return { processed: pendingRequests.length, sent, errors };
  }

  /**
   * Send a review request
   */
  async sendRequest(request: ReviewRequestDocument): Promise<void> {
    const settings = await this.settingsModel.findOne({
      storeId: request.storeId,
    });

    const store = await this.storeModel.findById(request.storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    // Build review link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const reviewLink = `${baseUrl}/review/${request.token}`;

    // Default SMS template if settings don't exist
    const defaultTemplate = 'Hi {customer_name}! Thank you for your order #{order_number}. We\'d love to hear your feedback! Click here to leave a review: {review_link}';
    const template = settings?.smsTemplate || defaultTemplate;

    // Build message from template
    const message = this.buildMessage(template, {
      customer_name: request.customerName,
      order_number: request.orderNumber,
      store_name: store.name,
      review_link: reviewLink,
    });

    // Send SMS (handle failures gracefully)
    try {
      const success = await this.smsService.sendSMS([
        { phone: request.customerPhone, message, lang: 'en' },
      ]);

      if (success) {
        request.status = ReviewRequestStatus.SENT;
        request.sentAt = new Date();
        request.sentVia = ReviewRequestChannel.SMS;
        await request.save();
        this.logger.log(`Review request sent to ${request.customerPhone} for order ${request.orderNumber}`);
      } else {
        this.logger.warn(`SMS sending failed for order ${request.orderNumber} - request remains pending`);
        // Don't throw - leave request as pending so it can be retried
      }
    } catch (error) {
      this.logger.error(`SMS service error for order ${request.orderNumber}: ${error.message}`);
      // Don't throw - leave request as pending so it can be retried
    }
  }

  /**
   * Send reminders for requests that need them
   * Called by scheduled job
   */
  async sendReminders(): Promise<{ processed: number; sent: number }> {
    const now = new Date();

    // Find requests that need reminders
    const requests = await this.reviewRequestModel.find({
      status: ReviewRequestStatus.SENT,
      tokenExpiresAt: { $gt: now },
      isDeleted: false,
    }).limit(100);

    let sent = 0;

    for (const request of requests) {
      const settings = await this.settingsModel.findOne({
        storeId: request.storeId,
      });

      if (!settings || !settings.sendReminders) continue;
      if (request.remindersSent >= settings.maxReminders) continue;

      // Check if enough time has passed since last message
      const lastMessage = request.lastReminderAt || request.sentAt;
      if (!lastMessage) continue;

      const daysSinceLastMessage = (now.getTime() - lastMessage.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLastMessage < settings.reminderDelayDays) continue;

      try {
        await this.sendReminder(request, settings);
        sent++;
      } catch (error) {
        this.logger.error(`Failed to send reminder for request ${request._id}: ${error.message}`);
      }
    }

    return { processed: requests.length, sent };
  }

  /**
   * Send a reminder for a request
   */
  private async sendReminder(
    request: ReviewRequestDocument,
    settings: ReviewRequestSettingsDocument,
  ): Promise<void> {
    const store = await this.storeModel.findById(request.storeId);
    if (!store) return;

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const reviewLink = `${baseUrl}/review/${request.token}`;

    const message = this.buildMessage(settings.reminderTemplate, {
      customer_name: request.customerName,
      order_number: request.orderNumber,
      store_name: store.name,
      review_link: reviewLink,
    });

    const success = await this.smsService.sendSMS([
      { phone: request.customerPhone, message, lang: 'en' },
    ]);

    if (success) {
      request.remindersSent++;
      request.lastReminderAt = new Date();
      await request.save();
      this.logger.log(`Reminder ${request.remindersSent} sent for request ${request._id}`);
    }
  }

  /**
   * Expire old requests
   * Called by scheduled job
   */
  async expireRequests(): Promise<number> {
    const now = new Date();

    const result = await this.reviewRequestModel.updateMany(
      {
        status: { $in: [ReviewRequestStatus.PENDING, ReviewRequestStatus.SENT, ReviewRequestStatus.OPENED] },
        tokenExpiresAt: { $lt: now },
        isDeleted: false,
      },
      {
        $set: { status: ReviewRequestStatus.EXPIRED },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} review requests`);
    }

    return result.modifiedCount;
  }

  // ==================== PUBLIC SUBMISSION ====================

  /**
   * Get request by token (for public submission page)
   */
  async getByToken(token: string): Promise<IPublicReviewRequest> {
    const request = await this.reviewRequestModel.findOne({
      token,
      isDeleted: false,
    });

    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    if (request.tokenExpiresAt < new Date()) {
      throw new BadRequestException('This review link has expired');
    }

    if (request.status === ReviewRequestStatus.COMPLETED) {
      throw new BadRequestException('Reviews have already been submitted for this order');
    }

    // Mark as opened if first time
    if (request.status === ReviewRequestStatus.SENT) {
      request.status = ReviewRequestStatus.OPENED;
      request.openedAt = new Date();
      await request.save();
    }

    const store = await this.storeModel.findById(request.storeId);

    return {
      storeName: store?.name || 'Store',
      storeUrl: store?.url,
      customerName: request.customerName,
      orderNumber: request.orderNumber,
      items: request.items.map((item) => ({
        productId: item.productId?.toString(),
        productName: item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        reviewed: item.reviewed,
      })),
      expiresAt: request.tokenExpiresAt,
    };
  }

  /**
   * Submit reviews from public page
   */
  async submitReviews(token: string, dto: SubmitReviewsDto): Promise<{ success: boolean; reviewsCreated: number }> {
    const request = await this.reviewRequestModel.findOne({
      token,
      isDeleted: false,
    });

    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    if (request.tokenExpiresAt < new Date()) {
      throw new BadRequestException('This review link has expired');
    }

    // Get settings for auto-approval
    const settings = await this.settingsModel.findOne({
      storeId: request.storeId,
    });

    let reviewsCreated = 0;

    for (const submission of dto.reviews) {
      // Determine if this is for a specific product or general
      const isProductReview = !!submission.productId;
      const item = submission.productId
        ? request.items.find((i) => i.productId?.toString() === submission.productId)
        : null;

      // Determine moderation status
      let moderationStatus = ModerationStatus.PENDING;
      let isPublished = false;

      if (settings?.autoApproveReviews && submission.rating >= settings.autoApproveMinRating) {
        moderationStatus = ModerationStatus.APPROVED;
        if (settings.autoPublishApproved) {
          isPublished = true;
        }
      }

      // Create review
      const reviewData: any = {
        reviewer: request.customerName,
        reviewerEmail: request.customerEmail,
        review: submission.review,
        rating: submission.rating,
        source: ReviewSource.REVIEW_REQUEST,
        reviewType: isProductReview ? ReviewType.PRODUCT : ReviewType.GENERAL,
        productId: submission.productId,
        customerPhone: request.customerPhone,
        customerId: request.customerId?.toString(),
        autoApprove: moderationStatus === ModerationStatus.APPROVED,
        autoPublish: isPublished,
      };

      try {
        const review = await this.reviewService.createManualReview(
          request.storeId.toString(),
          'system', // Created by system, not a user
          reviewData,
        );

        // Mark item as reviewed
        if (item) {
          item.reviewed = true;
          item.reviewId = new Types.ObjectId(review._id) as any;
        }

        reviewsCreated++;
      } catch (error) {
        this.logger.error(`Failed to create review: ${error.message}`);
      }
    }

    // Update request status
    const allReviewed = request.items.every((item) => item.reviewed);
    request.status = allReviewed ? ReviewRequestStatus.COMPLETED : ReviewRequestStatus.PARTIAL;
    request.submittedAt = new Date();
    await request.save();

    this.logger.log(`${reviewsCreated} reviews submitted for request ${request._id}`);

    return { success: true, reviewsCreated };
  }

  // ==================== MANUAL OPERATIONS ====================

  /**
   * Manually trigger a review request for an order
   */
  async manualTrigger(orderId: string, userId: string): Promise<IReviewRequest> {
    this.logger.log(`[manualTrigger] Starting for orderId: ${orderId}, userId: ${userId}`);

    try {
      const order = await this.orderModel.findOne({
        _id: new Types.ObjectId(orderId),
        isDeleted: false,
      });

      if (!order) {
        this.logger.warn(`[manualTrigger] Order not found: ${orderId}`);
        throw new NotFoundException('Order not found');
      }
      this.logger.log(`[manualTrigger] Order found: ${order.orderNumber}`);

      await this.verifyStoreAccess(order.storeId.toString(), userId);
      this.logger.log(`[manualTrigger] Store access verified`);

      // Check if request already exists
      const existingRequest = await this.reviewRequestModel.findOne({
        orderId: new Types.ObjectId(orderId),
      });

      if (existingRequest) {
        this.logger.warn(`[manualTrigger] Request already exists for order: ${orderId}`);
        throw new BadRequestException('Review request already exists for this order');
      }
      this.logger.log(`[manualTrigger] No existing request found`);

      // Force schedule with immediate sending (skip settings check for manual trigger)
      const request = await this.scheduleRequest(orderId, undefined, true);
      this.logger.log(`[manualTrigger] scheduleRequest result: ${request ? 'created' : 'null'}`);

      if (!request) {
        throw new BadRequestException('Could not create review request - check order has phone and items');
      }

      // Send immediately
      await this.sendRequest(request);
      this.logger.log(`[manualTrigger] Request sent successfully`);

      return this.toInterface(request);
    } catch (error) {
      this.logger.error(`[manualTrigger] Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Resend a review request
   */
  async resend(id: string, userId: string): Promise<IReviewRequest> {
    const request = await this.reviewRequestModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    await this.verifyStoreAccess(request.storeId.toString(), userId);

    if (request.status === ReviewRequestStatus.COMPLETED) {
      throw new BadRequestException('Cannot resend - reviews already submitted');
    }

    if (request.tokenExpiresAt < new Date()) {
      // Generate new token
      request.token = this.generateToken();
      request.tokenExpiresAt = new Date(Date.now() + request.expirationDays * 24 * 60 * 60 * 1000);
    }

    await this.sendRequest(request);

    return this.toInterface(request);
  }

  /**
   * Cancel a review request
   */
  async cancel(id: string, userId: string): Promise<void> {
    const request = await this.reviewRequestModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    await this.verifyStoreAccess(request.storeId.toString(), userId);

    request.isDeleted = true;
    await request.save();
  }

  // ==================== HELPERS ====================

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private buildMessage(template: string, variables: Record<string, string>): string {
    let message = template;
    Object.entries(variables).forEach(([key, value]) => {
      message = message.replace(new RegExp(`{${key}}`, 'g'), value || '');
    });
    return message;
  }

  private toInterface(doc: ReviewRequestDocument): IReviewRequest {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      orderId: obj.orderId.toString(),
      orderNumber: obj.orderNumber,
      customerId: obj.customerId?.toString(),
      customerName: obj.customerName,
      customerPhone: obj.customerPhone,
      customerEmail: obj.customerEmail,
      items: obj.items.map((item: any) => ({
        productId: item.productId?.toString(),
        productName: item.productName,
        productSku: item.productSku,
        productImage: item.productImage,
        quantity: item.quantity,
        reviewed: item.reviewed,
        reviewId: item.reviewId?.toString(),
      })),
      token: obj.token,
      tokenExpiresAt: obj.tokenExpiresAt,
      status: obj.status,
      scheduledFor: obj.scheduledFor,
      sentAt: obj.sentAt,
      sentVia: obj.sentVia,
      messageId: obj.messageId,
      openedAt: obj.openedAt,
      submittedAt: obj.submittedAt,
      remindersSent: obj.remindersSent,
      lastReminderAt: obj.lastReminderAt,
      delayHours: obj.delayHours,
      expirationDays: obj.expirationDays,
      isDeleted: obj.isDeleted,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private settingsToInterface(doc: ReviewRequestSettingsDocument): IReviewRequestSettings {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      storeId: obj.storeId.toString(),
      enabled: obj.enabled,
      triggerOn: obj.triggerOn,
      delayHours: obj.delayHours,
      linkExpirationDays: obj.linkExpirationDays,
      channel: obj.channel,
      sendReminders: obj.sendReminders,
      reminderDelayDays: obj.reminderDelayDays,
      maxReminders: obj.maxReminders,
      smsTemplate: obj.smsTemplate,
      reminderTemplate: obj.reminderTemplate,
      excludeOrdersBelow: obj.excludeOrdersBelow,
      onlyVerifiedCustomers: obj.onlyVerifiedCustomers,
      autoApproveReviews: obj.autoApproveReviews,
      autoApproveMinRating: obj.autoApproveMinRating,
      autoPublishApproved: obj.autoPublishApproved,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
