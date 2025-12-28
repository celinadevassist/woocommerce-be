import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Email, EmailDocument, EmailStatus } from './schema';
import { Customer, CustomerDocument } from '../customer/schema';

@Injectable()
export class EmailService {
  constructor(
    @InjectModel(Email.name) private emailModel: Model<EmailDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  /**
   * Normalize email to lowercase, trimmed format
   */
  normalizeEmail(email: string): string | null {
    if (!email) return null;

    const normalized = email.toLowerCase().trim();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Find or create email, optionally assign to customer
   */
  async findOrCreate(
    storeId: string,
    organizationId: string,
    emailAddress: string,
    customerId?: string,
    source: string = 'order',
    sourceOrderId?: string,
  ): Promise<EmailDocument> {
    const normalizedEmail = this.normalizeEmail(emailAddress);
    if (!normalizedEmail) {
      throw new BadRequestException('Invalid email address');
    }

    // Try to find existing email
    let email = await this.emailModel.findOne({
      storeId: new Types.ObjectId(storeId),
      email: normalizedEmail,
    });

    if (email) {
      // If email exists but has different customer, we might need to transfer
      if (customerId && email.customerId?.toString() !== customerId) {
        // Add to history if there was a previous owner
        if (email.customerId) {
          email.ownerHistory.push({
            customerId: email.customerId,
            assignedAt: email.createdAt,
            removedAt: new Date(),
            source: email.source,
          });
        }
        // Assign to new customer
        email.customerId = new Types.ObjectId(customerId) as any;
        email.source = source;
        if (sourceOrderId) email.sourceOrderId = sourceOrderId;
        await email.save();

        // Update new customer's primary email if not set
        await this.updateCustomerPrimaryEmail(customerId, normalizedEmail);
      }
      return email;
    }

    // Create new email
    email = await this.emailModel.create({
      email: normalizedEmail,
      storeId: new Types.ObjectId(storeId),
      organizationId: new Types.ObjectId(organizationId),
      customerId: customerId ? new Types.ObjectId(customerId) : undefined,
      source,
      sourceOrderId,
      status: EmailStatus.ACTIVE,
      marketingOptIn: true,
      transactionalOptIn: true,
      isVerified: false,
      ownerHistory: customerId ? [{
        customerId: new Types.ObjectId(customerId),
        assignedAt: new Date(),
        source,
      }] : [],
    });

    // Update customer's primary email if not set
    if (customerId) {
      await this.updateCustomerPrimaryEmail(customerId, normalizedEmail);
    }

    return email;
  }

  /**
   * Update customer's primary email if not set
   */
  private async updateCustomerPrimaryEmail(customerId: string, email: string): Promise<void> {
    await this.customerModel.updateOne(
      { _id: new Types.ObjectId(customerId), email: { $in: [null, ''] } },
      { email },
    );
  }

  /**
   * Get emails for a customer
   */
  async getCustomerEmails(customerId: string): Promise<EmailDocument[]> {
    return this.emailModel.find({
      customerId: new Types.ObjectId(customerId),
      isDeleted: false,
    }).sort({ isVerified: -1, createdAt: 1 });
  }

  /**
   * Get emails for a store (for email campaigns)
   */
  async getStoreEmails(
    storeId: string,
    options: {
      verified?: boolean;
      marketingOptIn?: boolean;
      status?: EmailStatus;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ emails: EmailDocument[]; total: number }> {
    const filter: any = {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    };

    if (options.verified !== undefined) filter.isVerified = options.verified;
    if (options.marketingOptIn !== undefined) filter.marketingOptIn = options.marketingOptIn;
    if (options.status) filter.status = options.status;

    const page = options.page || 1;
    const limit = options.limit || 50;

    const [emails, total] = await Promise.all([
      this.emailModel
        .find(filter)
        .populate('customerId', 'firstName lastName phone')
        .sort({ isVerified: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.emailModel.countDocuments(filter),
    ]);

    return { emails, total };
  }

  /**
   * Get emails ready for marketing campaign
   */
  async getCampaignEmails(storeId: string): Promise<EmailDocument[]> {
    return this.emailModel.find({
      storeId: new Types.ObjectId(storeId),
      status: EmailStatus.ACTIVE,
      marketingOptIn: true,
      isVerified: true,
      isDeleted: false,
    }).populate('customerId', 'firstName lastName phone');
  }

  /**
   * Verify an email
   */
  async verify(emailId: string, verifiedBy: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.isVerified = true;
    email.verifiedAt = new Date();
    email.verifiedBy = verifiedBy;
    await email.save();

    // Update customer's primary email to this verified one
    if (email.customerId) {
      await this.customerModel.updateOne(
        { _id: email.customerId },
        { email: email.email },
      );
    }

    return email;
  }

  /**
   * Unverify an email
   */
  async unverify(emailId: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.isVerified = false;
    email.verifiedAt = undefined;
    email.verifiedBy = undefined;
    await email.save();

    return email;
  }

  /**
   * Opt out of marketing emails
   */
  async optOutMarketing(emailId: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.marketingOptIn = false;
    email.marketingOptOutAt = new Date();
    await email.save();

    return email;
  }

  /**
   * Opt back into marketing emails
   */
  async optInMarketing(emailId: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.marketingOptIn = true;
    email.marketingOptOutAt = undefined;
    await email.save();

    return email;
  }

  /**
   * Unsubscribe from all emails
   */
  async unsubscribe(emailId: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.status = EmailStatus.UNSUBSCRIBED;
    email.marketingOptIn = false;
    email.transactionalOptIn = false;
    await email.save();

    return email;
  }

  /**
   * Block an email (invalid, spam, etc.)
   */
  async block(emailId: string, reason?: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.status = EmailStatus.BLOCKED;
    if (reason) email.notes = reason;
    await email.save();

    return email;
  }

  /**
   * Mark email as invalid (bounced)
   */
  async markInvalid(emailId: string, reason?: string): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    email.status = EmailStatus.INVALID;
    email.bounceCount = (email.bounceCount || 0) + 1;
    email.lastBounceAt = new Date();
    if (reason) email.bounceReason = reason;
    await email.save();

    return email;
  }

  /**
   * Record email sent
   */
  async recordEmailSent(emailId: string, success: boolean): Promise<void> {
    const update: any = {
      lastEmailSentAt: new Date(),
    };

    if (success) {
      update.$inc = { emailsSentCount: 1 };
    } else {
      update.$inc = { emailsFailedCount: 1 };
    }

    await this.emailModel.updateOne({ _id: emailId }, update);
  }

  /**
   * Record email opened
   */
  async recordEmailOpened(emailId: string): Promise<void> {
    await this.emailModel.updateOne(
      { _id: emailId },
      { $inc: { emailsOpenedCount: 1 } },
    );
  }

  /**
   * Record email link clicked
   */
  async recordEmailClicked(emailId: string): Promise<void> {
    await this.emailModel.updateOne(
      { _id: emailId },
      { $inc: { emailsClickedCount: 1 } },
    );
  }

  /**
   * Transfer email to different customer
   */
  async transferToCustomer(
    emailId: string,
    newCustomerId: string,
    reason?: string,
  ): Promise<EmailDocument> {
    const email = await this.emailModel.findById(emailId);
    if (!email) throw new NotFoundException('Email not found');

    // Add current owner to history
    if (email.customerId) {
      email.ownerHistory.push({
        customerId: email.customerId,
        assignedAt: email.createdAt,
        removedAt: new Date(),
        source: reason || 'transfer',
      });
    }

    // Assign to new customer
    email.customerId = new Types.ObjectId(newCustomerId) as any;
    await email.save();

    // Update new customer's primary email if not set
    await this.updateCustomerPrimaryEmail(newCustomerId, email.email);

    return email;
  }

  /**
   * Find customer by email address
   */
  async findCustomerByEmail(storeId: string, emailAddress: string): Promise<CustomerDocument | null> {
    const normalizedEmail = this.normalizeEmail(emailAddress);
    if (!normalizedEmail) return null;

    const email = await this.emailModel.findOne({
      storeId: new Types.ObjectId(storeId),
      email: normalizedEmail,
      isDeleted: false,
    });

    if (!email?.customerId) return null;

    return this.customerModel.findById(email.customerId);
  }

  /**
   * Get email stats for store
   */
  async getStats(storeId: string): Promise<{
    total: number;
    verified: number;
    unverified: number;
    marketingOptIn: number;
    marketingOptOut: number;
    blocked: number;
    invalid: number;
    unsubscribed: number;
  }> {
    const baseFilter = {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    };

    const [
      total,
      verified,
      unverified,
      marketingOptIn,
      marketingOptOut,
      blocked,
      invalid,
      unsubscribed,
    ] = await Promise.all([
      this.emailModel.countDocuments(baseFilter),
      this.emailModel.countDocuments({ ...baseFilter, isVerified: true }),
      this.emailModel.countDocuments({ ...baseFilter, isVerified: false }),
      this.emailModel.countDocuments({ ...baseFilter, marketingOptIn: true }),
      this.emailModel.countDocuments({ ...baseFilter, marketingOptIn: false }),
      this.emailModel.countDocuments({ ...baseFilter, status: EmailStatus.BLOCKED }),
      this.emailModel.countDocuments({ ...baseFilter, status: EmailStatus.INVALID }),
      this.emailModel.countDocuments({ ...baseFilter, status: EmailStatus.UNSUBSCRIBED }),
    ]);

    return { total, verified, unverified, marketingOptIn, marketingOptOut, blocked, invalid, unsubscribed };
  }

  /**
   * Delete email (soft delete)
   */
  async delete(emailId: string): Promise<void> {
    await this.emailModel.updateOne(
      { _id: emailId },
      { isDeleted: true },
    );
  }
}
