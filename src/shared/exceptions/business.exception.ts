import { HttpException, HttpStatus } from '@nestjs/common';
import { BusinessErrorCode } from './business-error.codes';

export class BusinessException extends HttpException {
  constructor(
    public readonly errorCode: BusinessErrorCode,
    message: string,
    public readonly details?: any,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST
  ) {
    super(
      {
        errorCode,
        message,
        details,
      },
      statusCode
    );
  }
}

// Specific business exceptions
export class InsufficientCreditsException extends BusinessException {
  constructor(required: number, available: number) {
    super(
      BusinessErrorCode.INSUFFICIENT_CREDITS,
      `Insufficient credits. Required: ${required}, Available: ${available}`,
      {
        required,
        available,
        action: 'recharge_credits'
      }
    );
  }
}

export class NoActiveSubscriptionException extends BusinessException {
  constructor() {
    super(
      BusinessErrorCode.NO_ACTIVE_SUBSCRIPTION,
      'No active subscription found',
      {
        action: 'subscribe_plan'
      }
    );
  }
}

export class SubscriptionLimitReachedException extends BusinessException {
  constructor(limitType: string, current: number, limit: number) {
    super(
      BusinessErrorCode.SUBSCRIPTION_LIMIT_REACHED,
      `Subscription limit reached for ${limitType}. Current: ${current}, Limit: ${limit}`,
      {
        limitType,
        current,
        limit,
        action: 'upgrade_plan'
      }
    );
  }
}

export class PaymentRequiredException extends BusinessException {
  constructor(reason: string) {
    super(
      BusinessErrorCode.PAYMENT_METHOD_REQUIRED,
      'Payment method required',
      {
        reason,
        action: 'add_payment_method'
      }
    );
  }
}
