import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from '../store/schema';
import { Attribute, AttributeDocument, AttributeTerm, AttributeTermDocument } from './schema';
import { WooCommerceService } from '../integrations/woocommerce/woocommerce.service';

export interface IAttributeWithTerms {
  _id: string;
  storeId: string;
  wooId: number;
  name: string;
  slug: string;
  type: string;
  orderBy: string;
  hasArchives: boolean;
  terms: {
    _id: string;
    wooId: number;
    name: string;
    slug: string;
    description: string;
    menuOrder: number;
    count: number;
  }[];
}

@Injectable()
export class AttributeService {
  private readonly logger = new Logger(AttributeService.name);

  constructor(
    @InjectModel(Attribute.name) private attributeModel: Model<AttributeDocument>,
    @InjectModel(AttributeTerm.name) private termModel: Model<AttributeTermDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    private readonly wooCommerceService: WooCommerceService,
  ) {}

  /**
   * Sync attributes and terms from WooCommerce to MongoDB
   */
  async syncFromWooCommerce(userId: string, storeId: string): Promise<{ attributes: number; terms: number }> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);
    const storeObjectId = new Types.ObjectId(storeId);

    // Fetch all attributes from WooCommerce
    const wooAttributes = await this.wooCommerceService.getAttributes(credentials);

    let totalTerms = 0;

    for (const wooAttr of wooAttributes) {
      // Upsert attribute
      const attribute = await this.attributeModel.findOneAndUpdate(
        { storeId: storeObjectId, wooId: wooAttr.id },
        {
          storeId: storeObjectId,
          wooId: wooAttr.id,
          name: wooAttr.name,
          slug: wooAttr.slug,
          type: wooAttr.type,
          orderBy: wooAttr.order_by,
          hasArchives: wooAttr.has_archives,
          isDeleted: false,
        },
        { upsert: true, new: true },
      );

      // Fetch terms for this attribute
      try {
        const termsResult = await this.wooCommerceService.getAttributeTerms(credentials, wooAttr.id);
        const wooTerms = termsResult.data;

        // Get existing term wooIds for this attribute
        const existingTermWooIds = new Set(
          (await this.termModel.find({ attributeId: attribute._id, isDeleted: false }).select('wooId')).map(t => t.wooId)
        );

        for (const wooTerm of wooTerms) {
          await this.termModel.findOneAndUpdate(
            { storeId: storeObjectId, wooId: wooTerm.id },
            {
              attributeId: attribute._id,
              storeId: storeObjectId,
              wooId: wooTerm.id,
              name: wooTerm.name,
              slug: wooTerm.slug,
              description: wooTerm.description,
              menuOrder: wooTerm.menu_order,
              count: wooTerm.count,
              isDeleted: false,
            },
            { upsert: true, new: true },
          );
          existingTermWooIds.delete(wooTerm.id);
          totalTerms++;
        }

        // Mark terms that no longer exist in WooCommerce as deleted
        if (existingTermWooIds.size > 0) {
          await this.termModel.updateMany(
            { attributeId: attribute._id, wooId: { $in: Array.from(existingTermWooIds) } },
            { isDeleted: true },
          );
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch terms for attribute ${wooAttr.id}: ${error.message}`);
      }
    }

    // Mark attributes that no longer exist in WooCommerce as deleted
    const syncedWooIds = wooAttributes.map(a => a.id);
    await this.attributeModel.updateMany(
      { storeId: storeObjectId, wooId: { $nin: syncedWooIds } },
      { isDeleted: true },
    );

    return { attributes: wooAttributes.length, terms: totalTerms };
  }

  /**
   * Get all attributes for a store (from MongoDB)
   */
  async getAttributes(userId: string, storeId: string): Promise<AttributeDocument[]> {
    await this.getStoreWithAccess(storeId, userId);
    return this.attributeModel.find({
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    }).sort({ name: 1 });
  }

  /**
   * Get all attributes with their terms (from MongoDB) - optimized with aggregation
   */
  async getAttributesWithTerms(userId: string, storeId: string): Promise<IAttributeWithTerms[]> {
    await this.getStoreWithAccess(storeId, userId);
    const storeObjectId = new Types.ObjectId(storeId);

    // Single aggregation query with $lookup to join terms
    const result = await this.attributeModel.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: 'attributeterms',
          let: { attributeId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$attributeId', '$$attributeId'] },
                isDeleted: false,
              },
            },
            { $sort: { menuOrder: 1, name: 1 } },
          ],
          as: 'terms',
        },
      },
      { $sort: { name: 1 } },
    ]);

    return result.map(attr => ({
      _id: attr._id.toString(),
      storeId: attr.storeId.toString(),
      wooId: attr.wooId,
      name: attr.name,
      slug: attr.slug,
      type: attr.type,
      orderBy: attr.orderBy,
      hasArchives: attr.hasArchives,
      terms: attr.terms.map((t: any) => ({
        _id: t._id.toString(),
        wooId: t.wooId,
        name: t.name,
        slug: t.slug,
        description: t.description,
        menuOrder: t.menuOrder,
        count: t.count,
      })),
    }));
  }

  /**
   * Get a single attribute with its terms
   */
  async getAttribute(userId: string, storeId: string, attributeId: string): Promise<IAttributeWithTerms> {
    await this.getStoreWithAccess(storeId, userId);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    const terms = await this.termModel.find({
      attributeId: attribute._id,
      isDeleted: false,
    }).sort({ menuOrder: 1, name: 1 });

    return {
      _id: attribute._id.toString(),
      storeId: attribute.storeId.toString(),
      wooId: attribute.wooId,
      name: attribute.name,
      slug: attribute.slug,
      type: attribute.type,
      orderBy: attribute.orderBy,
      hasArchives: attribute.hasArchives,
      terms: terms.map(t => ({
        _id: t._id.toString(),
        wooId: t.wooId,
        name: t.name,
        slug: t.slug,
        description: t.description,
        menuOrder: t.menuOrder,
        count: t.count,
      })),
    };
  }

  /**
   * Create an attribute (in WooCommerce and MongoDB)
   */
  async createAttribute(
    userId: string,
    storeId: string,
    data: { name: string; slug?: string; type?: string; orderBy?: string; hasArchives?: boolean },
  ): Promise<IAttributeWithTerms> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    // Create in WooCommerce first
    const wooAttr = await this.wooCommerceService.createAttribute(credentials, {
      name: data.name,
      slug: data.slug,
      type: data.type || 'select',
      order_by: data.orderBy || 'menu_order',
      has_archives: data.hasArchives || false,
    });

    // Create in MongoDB
    const attribute = await this.attributeModel.create({
      storeId: new Types.ObjectId(storeId),
      wooId: wooAttr.id,
      name: wooAttr.name,
      slug: wooAttr.slug,
      type: wooAttr.type,
      orderBy: wooAttr.order_by,
      hasArchives: wooAttr.has_archives,
    });

    return {
      _id: attribute._id.toString(),
      storeId: attribute.storeId.toString(),
      wooId: attribute.wooId,
      name: attribute.name,
      slug: attribute.slug,
      type: attribute.type,
      orderBy: attribute.orderBy,
      hasArchives: attribute.hasArchives,
      terms: [],
    };
  }

  /**
   * Update an attribute (in WooCommerce and MongoDB)
   */
  async updateAttribute(
    userId: string,
    storeId: string,
    attributeId: string,
    data: { name?: string; slug?: string; type?: string; orderBy?: string; hasArchives?: boolean },
  ): Promise<IAttributeWithTerms> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Update in WooCommerce first
    const wooAttr = await this.wooCommerceService.updateAttribute(credentials, attribute.wooId, {
      name: data.name,
      slug: data.slug,
      type: data.type,
      order_by: data.orderBy,
      has_archives: data.hasArchives,
    });

    // Update in MongoDB
    attribute.name = wooAttr.name;
    attribute.slug = wooAttr.slug;
    attribute.type = wooAttr.type;
    attribute.orderBy = wooAttr.order_by;
    attribute.hasArchives = wooAttr.has_archives;
    await attribute.save();

    // Get terms
    const terms = await this.termModel.find({
      attributeId: attribute._id,
      isDeleted: false,
    }).sort({ menuOrder: 1, name: 1 });

    return {
      _id: attribute._id.toString(),
      storeId: attribute.storeId.toString(),
      wooId: attribute.wooId,
      name: attribute.name,
      slug: attribute.slug,
      type: attribute.type,
      orderBy: attribute.orderBy,
      hasArchives: attribute.hasArchives,
      terms: terms.map(t => ({
        _id: t._id.toString(),
        wooId: t.wooId,
        name: t.name,
        slug: t.slug,
        description: t.description,
        menuOrder: t.menuOrder,
        count: t.count,
      })),
    };
  }

  /**
   * Delete an attribute (from WooCommerce and MongoDB)
   */
  async deleteAttribute(userId: string, storeId: string, attributeId: string): Promise<void> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Delete from WooCommerce first
    await this.wooCommerceService.deleteAttribute(credentials, attribute.wooId, true);

    // Soft delete in MongoDB
    attribute.isDeleted = true;
    await attribute.save();

    // Soft delete all terms
    await this.termModel.updateMany(
      { attributeId: attribute._id },
      { isDeleted: true },
    );
  }

  /**
   * Get terms for an attribute
   */
  async getTerms(userId: string, storeId: string, attributeId: string) {
    await this.getStoreWithAccess(storeId, userId);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    return this.termModel.find({
      attributeId: attribute._id,
      isDeleted: false,
    }).sort({ menuOrder: 1, name: 1 });
  }

  /**
   * Create a term (in WooCommerce and MongoDB)
   */
  async createTerm(
    userId: string,
    storeId: string,
    attributeId: string,
    data: { name: string; slug?: string; description?: string; menuOrder?: number },
  ) {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Create in WooCommerce first
    const wooTerm = await this.wooCommerceService.createAttributeTerm(credentials, attribute.wooId, {
      name: data.name,
      slug: data.slug,
      description: data.description,
      menu_order: data.menuOrder,
    });

    // Create in MongoDB
    const term = await this.termModel.create({
      attributeId: attribute._id,
      storeId: new Types.ObjectId(storeId),
      wooId: wooTerm.id,
      name: wooTerm.name,
      slug: wooTerm.slug,
      description: wooTerm.description,
      menuOrder: wooTerm.menu_order,
      count: wooTerm.count,
    });

    return {
      _id: term._id.toString(),
      wooId: term.wooId,
      name: term.name,
      slug: term.slug,
      description: term.description,
      menuOrder: term.menuOrder,
      count: term.count,
    };
  }

  /**
   * Update a term (in WooCommerce and MongoDB)
   */
  async updateTerm(
    userId: string,
    storeId: string,
    attributeId: string,
    termId: string,
    data: { name?: string; slug?: string; description?: string; menuOrder?: number },
  ) {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    const term = await this.termModel.findOne({
      _id: new Types.ObjectId(termId),
      attributeId: attribute._id,
      isDeleted: false,
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    // Update in WooCommerce first
    const wooTerm = await this.wooCommerceService.updateAttributeTerm(credentials, attribute.wooId, term.wooId, {
      name: data.name,
      slug: data.slug,
      description: data.description,
      menu_order: data.menuOrder,
    });

    // Update in MongoDB
    term.name = wooTerm.name;
    term.slug = wooTerm.slug;
    term.description = wooTerm.description;
    term.menuOrder = wooTerm.menu_order;
    term.count = wooTerm.count;
    await term.save();

    return {
      _id: term._id.toString(),
      wooId: term.wooId,
      name: term.name,
      slug: term.slug,
      description: term.description,
      menuOrder: term.menuOrder,
      count: term.count,
    };
  }

  /**
   * Delete a term (from WooCommerce and MongoDB)
   */
  async deleteTerm(
    userId: string,
    storeId: string,
    attributeId: string,
    termId: string,
  ): Promise<void> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    const term = await this.termModel.findOne({
      _id: new Types.ObjectId(termId),
      attributeId: attribute._id,
      isDeleted: false,
    });

    if (!term) {
      throw new NotFoundException('Term not found');
    }

    // Delete from WooCommerce first
    await this.wooCommerceService.deleteAttributeTerm(credentials, attribute.wooId, term.wooId, true);

    // Soft delete in MongoDB
    term.isDeleted = true;
    await term.save();
  }

  /**
   * Reorder terms (update menuOrder in WooCommerce and MongoDB)
   */
  async reorderTerms(
    userId: string,
    storeId: string,
    attributeId: string,
    termIds: string[],
  ): Promise<void> {
    const store = await this.getStoreWithAccess(storeId, userId);
    const credentials = this.getCredentials(store);

    const attribute = await this.attributeModel.findOne({
      _id: new Types.ObjectId(attributeId),
      storeId: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Update each term's menuOrder in parallel
    await Promise.all(
      termIds.map(async (termId, index) => {
        const term = await this.termModel.findOne({
          _id: new Types.ObjectId(termId),
          attributeId: attribute._id,
          isDeleted: false,
        });

        if (term) {
          // Update in WooCommerce
          await this.wooCommerceService.updateAttributeTerm(
            credentials,
            attribute.wooId,
            term.wooId,
            { menu_order: index },
          );

          // Update in MongoDB
          term.menuOrder = index;
          await term.save();
        }
      }),
    );
  }

  // Helper methods
  private async getStoreWithAccess(storeId: string, userId: string): Promise<StoreDocument> {
    const store = await this.storeModel
      .findOne({
        _id: new Types.ObjectId(storeId),
        isDeleted: false,
      })
      .select('+credentials');

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify store access - check if user is owner or member
    const isOwner = store.ownerId?.toString() === userId;
    const isMember = store.members?.some((m) => m.userId.toString() === userId);

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this store');
    }

    return store;
  }

  private getCredentials(store: StoreDocument) {
    return {
      url: store.url,
      consumerKey: store.credentials.consumerKey,
      consumerSecret: store.credentials.consumerSecret,
    };
  }
}
