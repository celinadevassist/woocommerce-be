import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from './service';

export const SKIP_SUBSCRIPTION_CHECK = 'skipSubscriptionCheck';

/**
 * Guard to check if a store's subscription is active
 * Blocks access to store operations if the subscription is suspended due to unpaid invoice
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private subscriptionService: SubscriptionService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this route should skip subscription check
    const skipCheck = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Get storeId from various sources
    const storeId =
      request.params?.storeId ||
      request.query?.storeId ||
      request.body?.storeId ||
      request.headers?.['x-store-id'];

    if (!storeId) {
      // No store context, allow access (might be organization-level operation)
      return true;
    }

    const { active, reason, invoice } = await this.subscriptionService.isStoreActive(storeId);

    if (!active) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Subscription Suspended',
        message: reason,
        code: 'SUBSCRIPTION_SUSPENDED',
        invoice: invoice ? {
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          invoiceId: invoice._id,
        } : undefined,
      });
    }

    return true;
  }
}

/**
 * Decorator to skip subscription check for specific routes
 * Use this for routes that should be accessible even with suspended subscription
 * (e.g., viewing invoices, making payments)
 */
import { SetMetadata } from '@nestjs/common';
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK, true);
