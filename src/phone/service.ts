import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Phone, PhoneDocument, PhoneStatus, PhoneType } from './schema';
import { Customer, CustomerDocument } from '../customer/schema';

@Injectable()
export class PhoneService {
  constructor(
    @InjectModel(Phone.name) private phoneModel: Model<PhoneDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  /**
   * Normalize phone number to unified format: +{countryCode}{number}
   */
  normalizePhoneNumber(phone: string, defaultCountryCode: string = '20'): string | null {
    if (!phone) return null;

    // Convert Arabic/Persian numerals to English
    const arabicNumerals = '٠١٢٣٤٥٦٧٨٩';
    const persianNumerals = '۰۱۲۳۴۵۶۷۸۹';
    let converted = phone;
    for (let i = 0; i < 10; i++) {
      converted = converted.replace(new RegExp(arabicNumerals[i], 'g'), String(i));
      converted = converted.replace(new RegExp(persianNumerals[i], 'g'), String(i));
    }

    // Remove all non-digit characters except +
    let normalized = converted.replace(/[^\d+]/g, '');

    // If empty after cleanup, return null
    if (!normalized || normalized.replace(/\+/g, '').length === 0) {
      return null;
    }

    // If starts with +, keep as is
    if (normalized.startsWith('+')) {
      return normalized;
    }

    // If starts with 00, replace with +
    if (normalized.startsWith('00')) {
      return '+' + normalized.substring(2);
    }

    // Egyptian number handling
    if (defaultCountryCode === '20') {
      if (normalized.startsWith('0')) {
        return '+2' + normalized;
      }
      if (normalized.startsWith('20') && normalized.length >= 11) {
        return '+' + normalized;
      }
    }

    // Default: add + and country code
    return '+' + defaultCountryCode + normalized;
  }

  /**
   * Find or create phone, optionally assign to customer
   */
  async findOrCreate(
    storeId: string,
    phoneNumber: string,
    customerId?: string,
    source: string = 'order',
    sourceOrderId?: string,
  ): Promise<PhoneDocument> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number');
    }

    // Try to find existing phone
    let phone = await this.phoneModel.findOne({
      storeId: new Types.ObjectId(storeId),
      number: normalizedPhone,
    });

    if (phone) {
      // If phone exists but has different customer, we might need to transfer
      if (customerId && phone.customerId?.toString() !== customerId) {
        // Add to history if there was a previous owner
        if (phone.customerId) {
          phone.ownerHistory.push({
            customerId: phone.customerId,
            assignedAt: phone.createdAt,
            removedAt: new Date(),
            source: phone.source,
          });
        }
        // Assign to new customer
        phone.customerId = new Types.ObjectId(customerId) as any;
        phone.source = source;
        if (sourceOrderId) phone.sourceOrderId = sourceOrderId;
        await phone.save();

        // Update new customer's primary phone if not set
        await this.updateCustomerPrimaryPhone(customerId, normalizedPhone);
      }
      return phone;
    }

    // Create new phone
    phone = await this.phoneModel.create({
      number: normalizedPhone,
      storeId: new Types.ObjectId(storeId),
      customerId: customerId ? new Types.ObjectId(customerId) : undefined,
      source,
      sourceOrderId,
      status: PhoneStatus.ACTIVE,
      type: PhoneType.MOBILE,
      smsOptIn: true,
      isVerified: false,
      ownerHistory: customerId ? [{
        customerId: new Types.ObjectId(customerId),
        assignedAt: new Date(),
        source,
      }] : [],
    });

    // Update customer's primary phone if not set
    if (customerId) {
      await this.updateCustomerPrimaryPhone(customerId, normalizedPhone);
    }

    return phone;
  }

  /**
   * Update customer's primary phone if not set
   */
  private async updateCustomerPrimaryPhone(customerId: string, phone: string): Promise<void> {
    await this.customerModel.updateOne(
      { _id: new Types.ObjectId(customerId), phone: { $in: [null, ''] } },
      { phone },
    );
  }

  /**
   * Get phones for a customer
   */
  async getCustomerPhones(customerId: string): Promise<PhoneDocument[]> {
    return this.phoneModel.find({
      customerId: new Types.ObjectId(customerId),
      isDeleted: false,
    }).sort({ isVerified: -1, createdAt: 1 });
  }

  /**
   * Get phones for a store (for SMS campaigns)
   */
  async getStorePhones(
    storeId: string,
    options: {
      verified?: boolean;
      smsOptIn?: boolean;
      status?: PhoneStatus;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ phones: PhoneDocument[]; total: number }> {
    const filter: any = {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    };

    if (options.verified !== undefined) filter.isVerified = options.verified;
    if (options.smsOptIn !== undefined) filter.smsOptIn = options.smsOptIn;
    if (options.status) filter.status = options.status;

    const page = options.page || 1;
    const limit = options.limit || 50;

    const [phones, total] = await Promise.all([
      this.phoneModel
        .find(filter)
        .populate('customerId', 'firstName lastName email')
        .sort({ isVerified: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.phoneModel.countDocuments(filter),
    ]);

    return { phones, total };
  }

  /**
   * Get phones ready for SMS campaign
   */
  async getCampaignPhones(storeId: string): Promise<PhoneDocument[]> {
    return this.phoneModel.find({
      storeId: new Types.ObjectId(storeId),
      status: PhoneStatus.ACTIVE,
      smsOptIn: true,
      isVerified: true,
      isDeleted: false,
    }).populate('customerId', 'firstName lastName email');
  }

  /**
   * Verify a phone
   */
  async verify(phoneId: string, verifiedBy: string): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    phone.isVerified = true;
    phone.verifiedAt = new Date();
    phone.verifiedBy = verifiedBy;
    await phone.save();

    // Update customer's primary phone to this verified one
    if (phone.customerId) {
      await this.customerModel.updateOne(
        { _id: phone.customerId },
        { phone: phone.number },
      );
    }

    return phone;
  }

  /**
   * Unverify a phone
   */
  async unverify(phoneId: string): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    phone.isVerified = false;
    phone.verifiedAt = undefined;
    phone.verifiedBy = undefined;
    await phone.save();

    return phone;
  }

  /**
   * Opt out of SMS
   */
  async optOut(phoneId: string): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    phone.smsOptIn = false;
    phone.smsOptOutAt = new Date();
    await phone.save();

    return phone;
  }

  /**
   * Opt back into SMS
   */
  async optIn(phoneId: string): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    phone.smsOptIn = true;
    phone.smsOptOutAt = undefined;
    await phone.save();

    return phone;
  }

  /**
   * Block a phone (invalid, spam, etc.)
   */
  async block(phoneId: string, reason?: string): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    phone.status = PhoneStatus.BLOCKED;
    if (reason) phone.notes = reason;
    await phone.save();

    return phone;
  }

  /**
   * Mark phone as invalid
   */
  async markInvalid(phoneId: string): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    phone.status = PhoneStatus.INVALID;
    await phone.save();

    return phone;
  }

  /**
   * Record SMS sent to phone
   */
  async recordSmsSent(phoneId: string, success: boolean): Promise<void> {
    const update: any = {
      lastSmsSentAt: new Date(),
    };

    if (success) {
      update.$inc = { smsSentCount: 1 };
    } else {
      update.$inc = { smsFailedCount: 1 };
    }

    await this.phoneModel.updateOne({ _id: phoneId }, update);
  }

  /**
   * Transfer phone to different customer
   */
  async transferToCustomer(
    phoneId: string,
    newCustomerId: string,
    reason?: string,
  ): Promise<PhoneDocument> {
    const phone = await this.phoneModel.findById(phoneId);
    if (!phone) throw new NotFoundException('Phone not found');

    // Add current owner to history
    if (phone.customerId) {
      phone.ownerHistory.push({
        customerId: phone.customerId,
        assignedAt: phone.createdAt,
        removedAt: new Date(),
        source: reason || 'transfer',
      });
    }

    // Assign to new customer
    phone.customerId = new Types.ObjectId(newCustomerId) as any;
    await phone.save();

    // Update new customer's primary phone if not set
    await this.updateCustomerPrimaryPhone(newCustomerId, phone.number);

    return phone;
  }

  /**
   * Find customer by phone number
   */
  async findCustomerByPhone(storeId: string, phoneNumber: string): Promise<CustomerDocument | null> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) return null;

    const phone = await this.phoneModel.findOne({
      storeId: new Types.ObjectId(storeId),
      number: normalizedPhone,
      isDeleted: false,
    });

    if (!phone?.customerId) return null;

    return this.customerModel.findById(phone.customerId);
  }

  /**
   * Get phone stats for store
   */
  async getStats(storeId: string): Promise<{
    total: number;
    verified: number;
    unverified: number;
    smsOptIn: number;
    smsOptOut: number;
    blocked: number;
    invalid: number;
  }> {
    const baseFilter = {
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    };

    const [
      total,
      verified,
      unverified,
      smsOptIn,
      smsOptOut,
      blocked,
      invalid,
    ] = await Promise.all([
      this.phoneModel.countDocuments(baseFilter),
      this.phoneModel.countDocuments({ ...baseFilter, isVerified: true }),
      this.phoneModel.countDocuments({ ...baseFilter, isVerified: false }),
      this.phoneModel.countDocuments({ ...baseFilter, smsOptIn: true }),
      this.phoneModel.countDocuments({ ...baseFilter, smsOptIn: false }),
      this.phoneModel.countDocuments({ ...baseFilter, status: PhoneStatus.BLOCKED }),
      this.phoneModel.countDocuments({ ...baseFilter, status: PhoneStatus.INVALID }),
    ]);

    return { total, verified, unverified, smsOptIn, smsOptOut, blocked, invalid };
  }

  /**
   * Delete phone (soft delete)
   */
  async delete(phoneId: string): Promise<void> {
    await this.phoneModel.updateOne(
      { _id: phoneId },
      { isDeleted: true },
    );
  }
}
