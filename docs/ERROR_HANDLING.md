# Error Handling Guide

This guide explains the error handling patterns used in the WooCommerce Management System backend. All errors follow a consistent structure that provides clear messages, error codes, and actionable guidance for clients.

## Table of Contents

- [Overview](#overview)
- [Error Response Structure](#error-response-structure)
- [Exception Types](#exception-types)
- [When to Use Each Exception](#when-to-use-each-exception)
- [Adding Action Hints](#adding-action-hints)
- [Frontend Integration Examples](#frontend-integration-examples)
- [Migration from Old Pattern](#migration-from-old-pattern)
- [Best Practices](#best-practices)

## Overview

The error handling system uses `BusinessException` as the base class for all business logic errors. Each exception includes:

- **Numeric error code** (BusinessErrorCode enum)
- **Descriptive message** explaining what went wrong
- **Details object** with context-specific information
- **Action hint** suggesting how to resolve the error
- **HTTP status code** (automatically set based on exception type)

### Error Response Format

```json
{
  "statusCode": 404,
  "errorCode": 2001,
  "message": "Product not found",
  "details": {
    "resourceType": "Product",
    "identifier": "invalid-id",
    "action": "verify_id"
  },
  "timestamp": "2026-01-27T10:30:00.000Z",
  "path": "/api/en/products/invalid-id"
}
```

## Error Response Structure

All error responses follow this consistent structure:

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | number | HTTP status code (404, 400, 401, 403, 409, 500, etc.) |
| `errorCode` | number | Unique numeric identifier from BusinessErrorCode enum |
| `message` | string | Human-readable error message |
| `details` | object | Context-specific information (varies by exception type) |
| `details.action` | string | **Required** - Suggested action to resolve the error |
| `timestamp` | string | ISO 8601 timestamp when error occurred |
| `path` | string | API endpoint where error occurred |

## Exception Types

### Base Class: BusinessException

All exceptions extend from `BusinessException`:

```typescript
import { BusinessException, BusinessErrorCode } from 'src/shared/exceptions';

// Constructor signature
new BusinessException(
  errorCode: BusinessErrorCode,
  message: string,
  details?: any,
  statusCode: HttpStatus = HttpStatus.BAD_REQUEST
)
```

### Common Exception Classes

#### 1. ResourceNotFoundException

**When to use:** Resource (product, order, store, user, etc.) cannot be found by ID or identifier.

**HTTP Status:** 404 Not Found
**Error Code:** `BusinessErrorCode.RESOURCE_NOT_FOUND_DETAILED` (2001)

**Usage:**

```typescript
import { ResourceNotFoundException } from 'src/shared/exceptions';

// When a product is not found
throw new ResourceNotFoundException('Product', productId);

// When a store is not found
throw new ResourceNotFoundException('Store', storeId);

// When an order is not found
throw new ResourceNotFoundException('Order', orderId);
```

**Response Example:**

```json
{
  "statusCode": 404,
  "errorCode": 2001,
  "message": "Product not found",
  "details": {
    "resourceType": "Product",
    "identifier": "abc123",
    "action": "verify_id"
  }
}
```

#### 2. ValidationException

**When to use:** Business logic validation fails (e.g., sale price > regular price, invalid status transition).

**HTTP Status:** 400 Bad Request
**Error Code:** `BusinessErrorCode.VALIDATION_FAILED` (2002)

**Usage:**

```typescript
import { ValidationException } from 'src/shared/exceptions';

// Price validation
if (salePrice > regularPrice) {
  throw new ValidationException(
    'salePrice',
    'cannot be greater than regular price',
    { regularPrice, salePrice }
  );
}

// Status transition validation
throw new ValidationException(
  'status',
  'cannot transition from completed to pending',
  { currentStatus: 'completed', requestedStatus: 'pending' }
);
```

**Response Example:**

```json
{
  "statusCode": 400,
  "errorCode": 2002,
  "message": "Validation failed for salePrice: cannot be greater than regular price",
  "details": {
    "field": "salePrice",
    "reason": "cannot be greater than regular price",
    "constraints": {
      "regularPrice": 100,
      "salePrice": 120
    },
    "action": "check_input"
  }
}
```

#### 3. AccessDeniedException

**When to use:** User doesn't have permission to perform an action or access a resource.

**HTTP Status:** 403 Forbidden
**Error Code:** `BusinessErrorCode.ACCESS_DENIED` (2003)

**Usage:**

```typescript
import { AccessDeniedException } from 'src/shared/exceptions';

// Store access denied
if (!hasAccess) {
  throw new AccessDeniedException('Store', 'You are not a member of this store');
}

// Role-based access
throw new AccessDeniedException('Order', 'Only store owner can perform this action');
```

**Response Example:**

```json
{
  "statusCode": 403,
  "errorCode": 2003,
  "message": "Access denied to Store: You are not a member of this store",
  "details": {
    "resource": "Store",
    "reason": "You are not a member of this store",
    "action": "check_permissions"
  }
}
```

#### 4. DuplicateResourceException

**When to use:** Attempting to create a resource that already exists (unique constraint violation).

**HTTP Status:** 409 Conflict
**Error Code:** `BusinessErrorCode.DUPLICATE_RESOURCE_DETAILED` (2004)

**Usage:**

```typescript
import { DuplicateResourceException } from 'src/shared/exceptions';

// Duplicate email
if (await this.userModel.findOne({ email })) {
  throw new DuplicateResourceException('User', 'email', email);
}

// Duplicate store URL
throw new DuplicateResourceException('Store', 'url', storeUrl);
```

**Response Example:**

```json
{
  "statusCode": 409,
  "errorCode": 2004,
  "message": "User with email 'user@example.com' already exists",
  "details": {
    "resourceType": "User",
    "field": "email",
    "value": "user@example.com",
    "action": "use_different_value"
  }
}
```

#### 5. InvalidInputException

**When to use:** Input parameter is malformed or doesn't meet expected format/type.

**HTTP Status:** 400 Bad Request
**Error Code:** `BusinessErrorCode.INVALID_INPUT` (2005)

**Usage:**

```typescript
import { InvalidInputException } from 'src/shared/exceptions';

// Invalid order type
if (!['online', 'pos'].includes(orderType)) {
  throw new InvalidInputException(
    'orderType',
    `must be 'online' or 'pos'`,
    'online or pos'
  );
}

// Invalid WooCommerce data
throw new InvalidInputException(
  'WooCommerce product data',
  `Failed to create in WooCommerce: ${error.message}`,
  'Valid product data compatible with WooCommerce API'
);
```

**Response Example:**

```json
{
  "statusCode": 400,
  "errorCode": 2005,
  "message": "Invalid orderType: must be 'online' or 'pos'",
  "details": {
    "parameter": "orderType",
    "reason": "must be 'online' or 'pos'",
    "expected": "online or pos",
    "action": "correct_input"
  }
}
```

#### 6. AuthenticationFailedException

**When to use:** Authentication credentials are invalid or missing.

**HTTP Status:** 401 Unauthorized
**Error Code:** `BusinessErrorCode.AUTHENTICATION_FAILED` (2006)

**Usage:**

```typescript
import { AuthenticationFailedException } from 'src/shared/exceptions';

// Invalid password
if (!await bcrypt.compare(password, user.password)) {
  throw new AuthenticationFailedException('Invalid email or password');
}

// Missing credentials
throw new AuthenticationFailedException('Email and password are required');
```

**Response Example:**

```json
{
  "statusCode": 401,
  "errorCode": 2006,
  "message": "Authentication failed",
  "details": {
    "reason": "Invalid email or password",
    "action": "check_credentials"
  }
}
```

#### 7. TokenExpiredException

**When to use:** JWT token, reset token, or verification token has expired.

**HTTP Status:** 401 Unauthorized
**Error Code:** `BusinessErrorCode.TOKEN_EXPIRED` (1102)

**Usage:**

```typescript
import { TokenExpiredException } from 'src/shared/exceptions';

// Password reset token expired
if (user.passwordResetExpires < new Date()) {
  throw new TokenExpiredException('Password reset token');
}

// Email verification token expired
throw new TokenExpiredException('Email verification token');
```

**Response Example:**

```json
{
  "statusCode": 401,
  "errorCode": 1102,
  "message": "Password reset token has expired",
  "details": {
    "tokenType": "Password reset token",
    "action": "request_new_token"
  }
}
```

#### 8. SystemErrorException

**When to use:** System/infrastructure errors (external API failures, database errors, email service down).

**HTTP Status:** 500 Internal Server Error
**Error Code:** `BusinessErrorCode.SYSTEM_ERROR` (2008)

**Usage:**

```typescript
import { SystemErrorException } from 'src/shared/exceptions';

// External API failure
try {
  await wooCommerceApi.createProduct(data);
} catch (error) {
  throw new SystemErrorException(
    'WooCommerce product creation',
    error?.message || 'WooCommerce API unavailable'
  );
}

// Email service failure
throw new SystemErrorException(
  'sending password reset email',
  'Email service unavailable'
);
```

**Response Example:**

```json
{
  "statusCode": 500,
  "errorCode": 2008,
  "message": "System error during sending password reset email",
  "details": {
    "operation": "sending password reset email",
    "reason": "Email service unavailable",
    "action": "try_again_later"
  }
}
```

### Subscription & Billing Exceptions

#### 9. InsufficientCreditsException

**When to use:** User doesn't have enough credits for an operation.

**HTTP Status:** 402 Payment Required
**Error Code:** `BusinessErrorCode.INSUFFICIENT_CREDITS` (1301)

**Usage:**

```typescript
import { InsufficientCreditsException } from 'src/shared/exceptions';

if (user.credits < requiredCredits) {
  throw new InsufficientCreditsException(requiredCredits, user.credits);
}
```

#### 10. NoActiveSubscriptionException

**When to use:** Operation requires an active subscription.

**HTTP Status:** 402 Payment Required
**Error Code:** `BusinessErrorCode.NO_ACTIVE_SUBSCRIPTION` (1201)

**Usage:**

```typescript
import { NoActiveSubscriptionException } from 'src/shared/exceptions';

if (!user.activeSubscription) {
  throw new NoActiveSubscriptionException();
}
```

#### 11. SubscriptionLimitReachedException

**When to use:** User has reached their subscription plan limit.

**HTTP Status:** 403 Forbidden
**Error Code:** `BusinessErrorCode.SUBSCRIPTION_LIMIT_REACHED` (1202)

**Usage:**

```typescript
import { SubscriptionLimitReachedException } from 'src/shared/exceptions';

if (storeCount >= subscription.maxStores) {
  throw new SubscriptionLimitReachedException('stores', storeCount, subscription.maxStores);
}
```

#### 12. PaymentRequiredException

**When to use:** Payment method is required to proceed.

**HTTP Status:** 402 Payment Required
**Error Code:** `BusinessErrorCode.PAYMENT_METHOD_REQUIRED` (1203)

**Usage:**

```typescript
import { PaymentRequiredException } from 'src/shared/exceptions';

if (!user.paymentMethod) {
  throw new PaymentRequiredException('No payment method on file');
}
```

## When to Use Each Exception

### Decision Flow

1. **Resource not found?** → `ResourceNotFoundException`
2. **User lacks permissions?** → `AccessDeniedException`
3. **Duplicate resource?** → `DuplicateResourceException`
4. **Business logic validation failed?** → `ValidationException`
5. **Input format/type wrong?** → `InvalidInputException`
6. **Authentication failed?** → `AuthenticationFailedException`
7. **Token expired?** → `TokenExpiredException`
8. **External system failure?** → `SystemErrorException`
9. **Subscription/billing issue?** → Use appropriate subscription exception

### Common Scenarios

| Scenario | Use This Exception |
|----------|-------------------|
| Product ID doesn't exist | `ResourceNotFoundException('Product', id)` |
| User not store member | `AccessDeniedException('Store', 'not a member')` |
| Email already registered | `DuplicateResourceException('User', 'email', email)` |
| Sale price > regular price | `ValidationException('salePrice', 'cannot exceed regular price')` |
| Invalid order type | `InvalidInputException('orderType', 'must be online or pos')` |
| Wrong password | `AuthenticationFailedException('Invalid credentials')` |
| Reset token expired | `TokenExpiredException('Password reset token')` |
| WooCommerce API down | `SystemErrorException('WooCommerce sync', 'API unavailable')` |
| Not enough credits | `InsufficientCreditsException(required, available)` |
| Plan limit reached | `SubscriptionLimitReachedException('products', current, limit)` |

## Adding Action Hints

The `details.action` field is **required** for all exceptions and provides guidance on how to resolve the error.

### Standard Action Values

| Action | Meaning | Used By |
|--------|---------|---------|
| `verify_id` | Check if the ID/identifier is correct | ResourceNotFoundException |
| `check_input` | Review input values for correctness | ValidationException |
| `check_permissions` | Verify user has required permissions | AccessDeniedException |
| `use_different_value` | Try a different value (not duplicate) | DuplicateResourceException |
| `correct_input` | Fix the input format/type | InvalidInputException |
| `check_credentials` | Verify username/password are correct | AuthenticationFailedException |
| `request_new_token` | Request a new token (old one expired) | TokenExpiredException |
| `try_again_later` | Retry the operation later | SystemErrorException |
| `recharge_credits` | Add more credits to account | InsufficientCreditsException |
| `subscribe_plan` | Subscribe to a plan | NoActiveSubscriptionException |
| `upgrade_plan` | Upgrade to higher tier | SubscriptionLimitReachedException |
| `add_payment_method` | Add a payment method | PaymentRequiredException |

### Custom Actions

When creating custom BusinessException instances, choose action hints that:

1. **Are actionable** - Tell the user what they can do
2. **Are specific** - Relate directly to the error
3. **Use snake_case** - Follow naming convention
4. **Are concise** - Short, clear phrases

**Example:**

```typescript
throw new BusinessException(
  BusinessErrorCode.INVALID_OPERATION,
  'Cannot delete order with pending payments',
  {
    orderId: order.id,
    status: order.status,
    action: 'complete_payment_first' // Custom action hint
  },
  HttpStatus.CONFLICT
);
```

## Frontend Integration Examples

### React/TypeScript Example

```typescript
// types/error.types.ts
export interface ApiErrorResponse {
  statusCode: number;
  errorCode: number;
  message: string;
  details: {
    action: string;
    [key: string]: any;
  };
  timestamp: string;
  path: string;
}

// utils/errorHandler.ts
export function getErrorMessage(error: any): string {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  return 'An unexpected error occurred';
}

export function getActionGuidance(error: any): string | null {
  const action = error.response?.data?.details?.action;
  if (!action) return null;

  const actionMessages: Record<string, string> = {
    verify_id: 'Please check the ID and try again.',
    check_input: 'Please review your input and correct any errors.',
    check_permissions: 'You do not have permission for this action. Contact your administrator.',
    use_different_value: 'This value is already in use. Please choose a different one.',
    correct_input: 'The input format is incorrect. Please check and try again.',
    check_credentials: 'Please verify your email and password are correct.',
    request_new_token: 'Your session has expired. Please request a new verification.',
    try_again_later: 'The service is temporarily unavailable. Please try again later.',
    recharge_credits: 'You need more credits. Please recharge your account.',
    subscribe_plan: 'This feature requires an active subscription.',
    upgrade_plan: 'You have reached your plan limit. Please upgrade to continue.',
    add_payment_method: 'Please add a payment method to proceed.',
  };

  return actionMessages[action] || 'Please try again or contact support.';
}

// components/ErrorAlert.tsx
import React from 'react';
import { getErrorMessage, getActionGuidance } from '../utils/errorHandler';

interface ErrorAlertProps {
  error: any;
  onRetry?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ error, onRetry }) => {
  const message = getErrorMessage(error);
  const guidance = getActionGuidance(error);
  const errorCode = error.response?.data?.errorCode;

  return (
    <div className="error-alert">
      <div className="error-message">{message}</div>
      {guidance && <div className="error-guidance">{guidance}</div>}
      {errorCode && <div className="error-code">Error Code: {errorCode}</div>}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
};

// Usage in a component
try {
  await api.createProduct(productData);
} catch (error) {
  setError(error);
  // ErrorAlert component will display appropriate message and guidance
}
```

### Handling Specific Error Codes

```typescript
// Handle specific error codes differently
async function handleLogin(email: string, password: string) {
  try {
    const response = await api.login({ email, password });
    return response.data;
  } catch (error: any) {
    const errorCode = error.response?.data?.errorCode;

    switch (errorCode) {
      case 2006: // AUTHENTICATION_FAILED
        showError('Invalid email or password. Please try again.');
        break;
      case 2001: // RESOURCE_NOT_FOUND
        showError('Account not found. Please sign up first.');
        break;
      case 1102: // TOKEN_EXPIRED
        showError('Your session has expired. Please login again.');
        break;
      default:
        showError('Login failed. Please try again later.');
    }

    throw error;
  }
}
```

### Form Validation with Action Hints

```typescript
// Display field-specific errors from ValidationException
interface FormErrors {
  [field: string]: string;
}

function handleValidationError(error: any): FormErrors {
  const details = error.response?.data?.details;

  if (error.response?.data?.errorCode === 2002) { // VALIDATION_FAILED
    return {
      [details.field]: details.reason
    };
  }

  return {};
}

// In form component
const handleSubmit = async (values: FormValues) => {
  try {
    await api.updateProduct(values);
  } catch (error: any) {
    const errors = handleValidationError(error);
    setFormErrors(errors);
  }
};
```

## Migration from Old Pattern

### Old Pattern (Deprecated)

```typescript
// ❌ DON'T USE - Old pattern
import { BusinessException } from 'src/exceptions/business.exception';
import { ErrorCodes } from 'src/constants/error-codes';

throw new BusinessException(
  ErrorCodes.INTERNAL_SERVER_ERROR,
  HttpStatus.INTERNAL_SERVER_ERROR
);

// or
throw new NotFoundException('Product not found');
```

### New Pattern (Current)

```typescript
// ✅ DO USE - New pattern
import {
  ResourceNotFoundException,
  ValidationException,
  SystemErrorException
} from 'src/shared/exceptions';

// Clear, descriptive, with action hints
throw new ResourceNotFoundException('Product', productId);

throw new ValidationException('salePrice', 'cannot exceed regular price', {
  regularPrice,
  salePrice
});

throw new SystemErrorException('product sync', 'WooCommerce API unavailable');
```

### Migration Checklist

When migrating a service to the new pattern:

- [ ] Replace `import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'`
- [ ] Replace with `import { ResourceNotFoundException, ValidationException, AccessDeniedException, ... } from 'src/shared/exceptions'`
- [ ] Convert `throw new NotFoundException(...)` → `throw new ResourceNotFoundException(resourceType, id)`
- [ ] Convert `throw new BadRequestException(...)` → `throw new ValidationException(field, reason)` or `InvalidInputException(...)`
- [ ] Convert `throw new ForbiddenException(...)` → `throw new AccessDeniedException(resource, reason)`
- [ ] Convert `throw new ConflictException(...)` → `throw new DuplicateResourceException(...)`
- [ ] Add context-specific details to all exceptions
- [ ] Ensure all errors include actionable hints
- [ ] Remove any `console.log` or `console.error` statements (use Logger instead)
- [ ] Test error responses include `errorCode`, `message`, and `details.action`

## Best Practices

### 1. Always Include Context

**Bad:**
```typescript
throw new ResourceNotFoundException('Resource', id);
```

**Good:**
```typescript
throw new ResourceNotFoundException('Product', productId);
```

### 2. Provide Helpful Details

**Bad:**
```typescript
throw new ValidationException('field', 'invalid');
```

**Good:**
```typescript
throw new ValidationException(
  'salePrice',
  'cannot be greater than regular price',
  { regularPrice: 100, salePrice: 120 }
);
```

### 3. Use Specific Exceptions

**Bad:**
```typescript
throw new BusinessException(
  BusinessErrorCode.INVALID_INPUT,
  'Error occurred',
  {},
  HttpStatus.BAD_REQUEST
);
```

**Good:**
```typescript
throw new InvalidInputException(
  'orderType',
  `must be 'online' or 'pos', received: ${orderType}`,
  'online or pos'
);
```

### 4. Consistent Action Hints

Always include the `action` field in details:

```typescript
// Each exception automatically includes action hint
throw new ResourceNotFoundException('Order', orderId);
// Includes: { action: 'verify_id' }

throw new ValidationException('quantity', 'must be greater than 0');
// Includes: { action: 'check_input' }
```

### 5. Use Logger for Debugging

**Bad:**
```typescript
console.log('User not found:', userId);
throw new ResourceNotFoundException('User', userId);
```

**Good:**
```typescript
import { Logger } from '@nestjs/common';

private readonly logger = new Logger(ProductService.name);

this.logger.warn(`User not found: ${userId}`);
throw new ResourceNotFoundException('User', userId);
```

### 6. Catch and Re-throw with Context

**Bad:**
```typescript
try {
  await wooApi.createProduct(data);
} catch (error) {
  throw error; // Loses context
}
```

**Good:**
```typescript
try {
  await wooApi.createProduct(data);
} catch (error) {
  this.logger.error(`WooCommerce API error: ${error.message}`);
  throw new SystemErrorException(
    'WooCommerce product creation',
    error?.response?.data?.message || 'API unavailable'
  );
}
```

### 7. Don't Expose Internal Details

**Bad:**
```typescript
throw new SystemErrorException(
  'database query',
  `SELECT * FROM users WHERE password='${password}'` // Exposes query
);
```

**Good:**
```typescript
throw new SystemErrorException(
  'user lookup',
  'Database query failed'
);
```

## Summary

- ✅ **Always use** BusinessException or its subclasses
- ✅ **Include** errorCode, message, and details.action
- ✅ **Provide** specific, contextual error messages
- ✅ **Add** actionable guidance for error resolution
- ✅ **Use** Logger for debugging (not console.log)
- ❌ **Don't use** generic NestJS exceptions (NotFoundException, BadRequestException, etc.)
- ❌ **Don't expose** sensitive internal details
- ❌ **Don't use** deprecated BusinessException from src/exceptions/

For questions or issues with error handling, refer to:
- `src/shared/exceptions/business.exception.ts` - Exception class definitions
- `src/shared/exceptions/business-error.codes.ts` - Error code enum
- Migrated services (product, order, store, auth) - Real-world examples
