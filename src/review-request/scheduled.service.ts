import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReviewRequestService } from './service';

@Injectable()
export class ReviewRequestScheduledService {
  private readonly logger = new Logger(ReviewRequestScheduledService.name);

  constructor(private readonly reviewRequestService: ReviewRequestService) {}

  /**
   * Process pending review requests every hour
   * Sends SMS for requests that have reached their scheduled send time
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processPendingRequests(): Promise<void> {
    this.logger.log('Processing pending review requests...');
    try {
      const result = await this.reviewRequestService.processPendingRequests();
      this.logger.log(
        `Pending requests processed: ${result.processed} total, ${result.sent} sent, ${result.errors} errors`,
      );
    } catch (error) {
      this.logger.error(`Failed to process pending requests: ${error.message}`);
    }
  }

  /**
   * Send reminders every day at 9 AM
   * Sends reminder SMS to customers who haven't submitted reviews yet
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendReminders(): Promise<void> {
    this.logger.log('Sending review request reminders...');
    try {
      const result = await this.reviewRequestService.sendReminders();
      this.logger.log(
        `Reminders processed: ${result.processed} checked, ${result.sent} sent`,
      );
    } catch (error) {
      this.logger.error(`Failed to send reminders: ${error.message}`);
    }
  }

  /**
   * Expire old requests every day at midnight
   * Marks requests as expired if their token has passed the expiration date
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireRequests(): Promise<void> {
    this.logger.log('Expiring old review requests...');
    try {
      const count = await this.reviewRequestService.expireRequests();
      if (count > 0) {
        this.logger.log(`Expired ${count} review requests`);
      }
    } catch (error) {
      this.logger.error(`Failed to expire requests: ${error.message}`);
    }
  }
}
