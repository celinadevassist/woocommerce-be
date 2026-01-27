import { HttpException, HttpStatus } from '@nestjs/common';
import { BusinessErrorCode } from './business-error.codes';

export class BusinessException extends HttpException {
  constructor(
    public readonly errorCode: BusinessErrorCode,
    message: string,
    public readonly details?: any,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        errorCode,
        message,
        details,
      },
      statusCode,
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
        action: 'recharge_credits',
      },
    );
  }
}

export class NoActiveSubscriptionException extends BusinessException {
  constructor() {
    super(
      BusinessErrorCode.NO_ACTIVE_SUBSCRIPTION,
      'No active subscription found',
      {
        action: 'subscribe_plan',
      },
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
        action: 'upgrade_plan',
      },
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
        action: 'add_payment_method',
      },
    );
  }
}

// Common error scenarios
export class ResourceNotFoundException extends BusinessException {
  constructor(resourceType: string, identifier: string | number) {
    super(
      BusinessErrorCode.RESOURCE_NOT_FOUND_DETAILED,
      `${resourceType} not found`,
      {
        resourceType,
        identifier,
        action: 'verify_id',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ValidationException extends BusinessException {
  constructor(field: string, reason: string, constraints?: Record<string, any>) {
    super(
      BusinessErrorCode.VALIDATION_FAILED,
      `Validation failed for ${field}: ${reason}`,
      {
        field,
        reason,
        constraints,
        action: 'check_input',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class AccessDeniedException extends BusinessException {
  constructor(resource: string, reason?: string) {
    super(
      BusinessErrorCode.ACCESS_DENIED,
      `Access denied to ${resource}${reason ? ': ' + reason : ''}`,
      {
        resource,
        reason,
        action: 'check_permissions',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class DuplicateResourceException extends BusinessException {
  constructor(resourceType: string, field: string, value: any) {
    super(
      BusinessErrorCode.DUPLICATE_RESOURCE_DETAILED,
      `${resourceType} with ${field} '${value}' already exists`,
      {
        resourceType,
        field,
        value,
        action: 'use_different_value',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidInputException extends BusinessException {
  constructor(parameter: string, reason: string, expected?: string) {
    super(
      BusinessErrorCode.INVALID_INPUT,
      `Invalid ${parameter}: ${reason}`,
      {
        parameter,
        reason,
        expected,
        action: 'correct_input',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

// Authentication specific exceptions
export class AuthenticationFailedException extends BusinessException {
  constructor(reason: string = 'Invalid credentials') {
    super(
      BusinessErrorCode.AUTHENTICATION_FAILED,
      'Authentication failed',
      {
        reason,
        action: 'check_credentials',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class TokenExpiredException extends BusinessException {
  constructor(tokenType: string = 'token') {
    super(
      BusinessErrorCode.TOKEN_EXPIRED,
      `${tokenType} has expired`,
      {
        tokenType,
        action: 'request_new_token',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class SystemErrorException extends BusinessException {
  constructor(operation: string, reason?: string) {
    super(
      BusinessErrorCode.SYSTEM_ERROR,
      `System error during ${operation}`,
      {
        operation,
        reason,
        action: 'try_again_later',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
