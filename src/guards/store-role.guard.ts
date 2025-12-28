import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from '../store/schema';
import { StoreMemberRole } from '../store/enum';

export const STORE_ROLES_KEY = 'storeRoles';

// Role hierarchy - higher roles include permissions of lower roles
const ROLE_HIERARCHY: Record<StoreMemberRole, number> = {
  [StoreMemberRole.OWNER]: 100,
  [StoreMemberRole.ADMIN]: 80,
  [StoreMemberRole.MANAGER]: 60,
  [StoreMemberRole.STAFF]: 40,
  [StoreMemberRole.VIEWER]: 20,
};

@Injectable()
export class StoreRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Store.name)
    private readonly storeModel: Model<StoreDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<StoreMemberRole[]>(
      STORE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get store ID from various sources
    const storeId = this.getStoreId(request);

    if (!storeId) {
      throw new ForbiddenException('Store context required');
    }

    // Get the store
    const store = await this.storeModel.findOne({
      _id: new Types.ObjectId(storeId),
      isDeleted: false,
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Check if user is owner
    const userId = user._id?.toString() || user.id?.toString();
    if (store.ownerId?.toString() === userId) {
      // Owner has all permissions
      request.storeRole = StoreMemberRole.OWNER;
      request.store = store;
      return true;
    }

    // Find user's membership
    const member = store.members?.find(
      (m) => m.userId.toString() === userId,
    );

    if (!member) {
      throw new ForbiddenException('You do not have access to this store');
    }

    const userRole = member.role as StoreMemberRole;
    const userRoleLevel = ROLE_HIERARCHY[userRole] || 0;

    // Check if user's role meets the minimum required role
    const hasRequiredRole = requiredRoles.some((requiredRole) => {
      const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
      return userRoleLevel >= requiredLevel;
    });

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    // Attach role and store to request for downstream use
    request.storeRole = userRole;
    request.storeMember = member;
    request.store = store;

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
}
