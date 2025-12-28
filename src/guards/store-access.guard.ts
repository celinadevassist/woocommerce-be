import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from '../store/schema';
import { Organization, OrganizationDocument } from '../organization/schema';
import { OrganizationMemberRole } from '../organization/enum';

@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(
    @InjectModel(Store.name)
    private readonly storeModel: Model<StoreDocument>,
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get store ID from various sources
    const storeId = this.getStoreId(request);

    if (!storeId) {
      // If no store ID is required, allow access
      return true;
    }

    // Get the store
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Get the organization
    const organization = await this.organizationModel.findOne({
      _id: store.organizationId,
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const userId = user._id?.toString() || user.id?.toString();

    // Check if user is organization owner
    if (organization.ownerId.toString() === userId) {
      // Owner has access to all stores
      request.store = store;
      request.organization = organization;
      request.organizationRole = OrganizationMemberRole.OWNER;
      return true;
    }

    // Find user's membership
    const member = organization.members.find(
      (m) => m.userId.toString() === userId,
    );

    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Check store access
    const hasStoreAccess = this.checkStoreAccess(member.storeAccess, storeId);

    if (!hasStoreAccess) {
      throw new ForbiddenException('You do not have access to this store');
    }

    // Attach store, organization, and member info to request
    request.store = store;
    request.organization = organization;
    request.organizationRole = member.role;
    request.organizationMember = member;

    return true;
  }

  private getStoreId(request: any): string | null {
    // Check various sources for store ID
    return (
      request.params?.storeId ||
      request.params?.id ||
      request.body?.storeId ||
      request.query?.storeId ||
      request.headers['x-store-id'] ||
      null
    );
  }

  private checkStoreAccess(
    storeAccess: string[] | 'all',
    storeId: string,
  ): boolean {
    // 'all' means access to all stores
    if (storeAccess === 'all') {
      return true;
    }

    // Check if the specific store is in the access list
    if (Array.isArray(storeAccess)) {
      return storeAccess.some(
        (accessId) => accessId.toString() === storeId.toString(),
      );
    }

    return false;
  }
}
