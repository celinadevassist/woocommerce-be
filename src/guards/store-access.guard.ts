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
import { StoreMemberRole } from '../store/enum';

@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(
    @InjectModel(Store.name)
    private readonly storeModel: Model<StoreDocument>,
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

    const userId = user._id?.toString() || user.id?.toString();

    // Check if user is store owner
    if (store.ownerId?.toString() === userId) {
      // Owner has full access
      request.store = store;
      request.storeRole = StoreMemberRole.OWNER;
      return true;
    }

    // Find user's membership in store
    const member = store.members?.find((m) => m.userId.toString() === userId);

    if (!member) {
      throw new ForbiddenException('You do not have access to this store');
    }

    // Attach store and member info to request
    request.store = store;
    request.storeRole = member.role;
    request.storeMember = member;

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
