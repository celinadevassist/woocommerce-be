# Error Migration Plan

## Executive Summary

Based on the error audit of 51 service files containing 474 error occurrences, we've identified that **93% of errors use generic HTTP exceptions** (NotFoundException, BadRequestException, etc.) while only **4.4% use the BusinessException pattern** with actionable guidance.

This document outlines a prioritized migration strategy to replace generic exceptions with user-friendly BusinessException subclasses that include clear error codes and actionable guidance.

---

## Top 10 Most Common Error Scenarios

### 1. **Resource Not Found Errors** (52.3% - 248 occurrences)
**Current Pattern:**
```typescript
throw new NotFoundException('Store not found');
throw new NotFoundException('Order not found');
throw new NotFoundException('Product not found');
```

**Problem:** Generic 404 response with no guidance on why the resource wasn't found or what to do next.

**New Pattern:**
```typescript
throw new ResourceNotFoundException('Store', storeId, {
  action: 'verify_store_id',
  suggestedAction: 'Please verify the store ID and ensure you have access to this store',
});
```

**Most Frequent Messages:**
- "Store not found" (58 times)
- "Order not found" (18 times)
- "Review not found" (13 times)
- "Product not found" (9 times)
- "Production batch not found" (8 times)
- "Customer not found" (8 times)
- "Attribute not found" (8 times)

---

### 2. **Validation & Bad Request Errors** (25.3% - 120 occurrences)
**Current Pattern:**
```typescript
throw new BadRequestException('Unable to extract message');
throw new BadRequestException('Invalid input');
throw new BadRequestException();
```

**Problem:** Vague "Bad Request" without explaining what's invalid or how to fix it.

**New Pattern:**
```typescript
throw new ValidationException('Required field missing', {
  field: 'message',
  reason: 'Message body is empty or malformed',
  action: 'provide_valid_message',
  suggestedAction: 'Please provide a valid message in the request body',
});
```

**Most Frequent Message:**
- "Unable to extract message" (29 times) - indicates missing or malformed request data

---

### 3. **Access Control Errors** (8.0% - 38 occurrences)
**Current Pattern:**
```typescript
throw new ForbiddenException('You do not have access to this store');
throw new ForbiddenException();
```

**Problem:** Doesn't explain what permission is needed or how to gain access.

**New Pattern:**
```typescript
throw new AccessDeniedException('store', storeId, {
  requiredScope: 'store:read',
  action: 'request_store_access',
  suggestedAction: 'Contact the store owner to request access or verify your current permissions',
});
```

**Most Frequent Message:**
- "You do not have access to this store" (16 times)

---

### 4. **Duplicate Resource Errors** (6.3% - 30 occurrences)
**Current Pattern:**
```typescript
throw new ConflictException('Email already exists');
throw new ConflictException('Duplicate entry');
```

**Problem:** Doesn't specify which field is duplicated or suggest alternatives.

**New Pattern:**
```typescript
throw new DuplicateResourceException('User', { email: existingEmail }, {
  action: 'use_different_email',
  suggestedAction: 'This email is already registered. Please use a different email or try logging in',
});
```

---

### 5. **Generic Error Throws** (2.5% - 12 occurrences)
**Current Pattern:**
```typescript
throw new Error('Store not found');
throw new Error('Invalid landing page structure');
```

**Problem:** Not caught by NestJS exception filters, returns 500 instead of appropriate status code.

**New Pattern:**
- Convert to appropriate BusinessException subclass based on context
- Always use HTTP exceptions in NestJS, never generic Error

---

### 6. **Store ID Requirement Errors** (Multiple occurrences)
**Current Pattern:**
```typescript
throw new NotFoundException('Store ID is required');
```

**Problem:** Store ID is a required parameter, not a "not found" issue. Wrong status code.

**New Pattern:**
```typescript
throw new InvalidInputException('storeId', {
  reason: 'Store ID is required for this operation',
  action: 'provide_store_id',
  suggestedAction: 'Please include a valid store ID in your request',
});
```

---

### 7. **Invalid Phone Number Errors** (5 occurrences)
**Current Pattern:**
```typescript
throw new NotFoundException('Invalid phone number');
```

**Problem:** Wrong status code (404 instead of 400), no guidance on format.

**New Pattern:**
```typescript
throw new ValidationException('Invalid phone number format', {
  field: 'phone',
  expectedFormat: '+[country code][number]',
  action: 'correct_phone_format',
  suggestedAction: 'Please provide a phone number in international format (e.g., +1234567890)',
});
```

---

### 8. **Authentication Errors** (1 occurrence in audit, but critical)
**Current Pattern:**
```typescript
throw new UnauthorizedException();
throw new UnauthorizedException('Invalid credentials');
```

**Problem:** No guidance on what to do next (reset password, verify email, etc.)

**New Pattern:**
```typescript
throw new AuthenticationException('Invalid email or password', {
  action: 'verify_credentials',
  suggestedAction: 'Please check your email and password. You can reset your password if you\'ve forgotten it',
  additionalActions: ['reset_password', 'contact_support'],
});
```

---

### 9. **Internal Server Errors** (3 occurrences)
**Current Pattern:**
```typescript
throw new InternalServerErrorException();
throw new InternalServerErrorException('Database error');
```

**Problem:** Exposes internal errors to clients, no recovery guidance.

**New Pattern:**
```typescript
throw new SystemException('temporary_service_unavailable', {
  action: 'retry_later',
  suggestedAction: 'We\'re experiencing technical difficulties. Please try again in a few moments',
  retryAfter: 60, // seconds
});
```

---

### 10. **Rate Limiting Errors** (Found in openai.service.ts)
**Current Pattern:**
```typescript
throw new Error('Rate limit exceeded, please try again later.');
```

**Problem:** Generic Error (500), no indication of when to retry.

**New Pattern:**
```typescript
throw new RateLimitException('API rate limit exceeded', {
  action: 'retry_after_delay',
  suggestedAction: 'You\'ve made too many requests. Please wait before trying again',
  retryAfter: 60,
});
```

---

## Services Prioritized for Migration

### Priority 1: Critical Services (High Traffic)
1. **src/store/service.ts** (32 errors) - Core store management
2. **src/product/service.ts** (32 errors) - Product catalog
3. **src/order/service.ts** (23 errors) - Order processing
4. **src/customer/service.ts** (23 errors) - Customer management

### Priority 2: Important Services (Medium Traffic)
5. **src/shipping/service.ts** (27 errors) - Shipping management
6. **src/invitation/service.ts** (27 errors) - User invitations
7. **src/review/service.ts** (21 errors) - Product reviews
8. **src/admin/service.ts** (21 errors) - Admin operations

### Priority 3: Supporting Services
9. **src/services/users.service.ts** (17 errors) - User management
10. **src/sync/service.ts** (16 errors) - Data synchronization
11. **src/review-request/service.ts** (15 errors)
12. **src/attribute/service.ts** (15 errors)
13. **src/inventory-materials/service.ts** (14 errors)
14. **src/production-batches/service.ts** (22 errors)

---

## Recommended New BusinessException Classes

Based on the error patterns, we recommend creating these BusinessException subclasses:

### 1. **ResourceNotFoundException**
```typescript
// errorCode: 2001
// Use for: Resource not found by ID
// Current usage: NotFoundException (248 occurrences)
```

### 2. **ValidationException**
```typescript
// errorCode: 2002
// Use for: Input validation failures, malformed data
// Current usage: BadRequestException with validation context (60+ occurrences)
```

### 3. **AccessDeniedException**
```typescript
// errorCode: 2003
// Use for: Insufficient permissions, scope violations
// Current usage: ForbiddenException (38 occurrences)
```

### 4. **DuplicateResourceException**
```typescript
// errorCode: 2004
// Use for: Unique constraint violations, duplicate entries
// Current usage: ConflictException (30 occurrences)
```

### 5. **InvalidInputException**
```typescript
// errorCode: 2005
// Use for: Wrong parameter type, missing required field
// Current usage: BadRequestException without validation context (60+ occurrences)
```

### 6. **AuthenticationException**
```typescript
// errorCode: 2006
// Use for: Invalid credentials, token expired
// Current usage: UnauthorizedException (1 occurrence, but critical)
```

### 7. **RateLimitException**
```typescript
// errorCode: 2007
// Use for: Too many requests, quota exceeded
// Current usage: Error (found in openai.service.ts)
```

### 8. **SystemException**
```typescript
// errorCode: 2008
// Use for: Internal errors that shouldn't expose details
// Current usage: InternalServerErrorException (3 occurrences)
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1)
- [ ] Create 8 new BusinessException classes
- [ ] Add error codes to `business-error.codes.ts`
- [ ] Export from `shared/exceptions/index.ts`
- [ ] Update exception filter to handle new classes

### Phase 2: Core Services (Week 2)
- [ ] Migrate store.service.ts (32 errors → ~10 with patterns)
- [ ] Migrate product.service.ts (32 errors → ~10 with patterns)
- [ ] Migrate order.service.ts (23 errors)
- [ ] Migrate customer.service.ts (23 errors)
- [ ] Test API endpoints for correct error responses

### Phase 3: Supporting Services (Week 3)
- [ ] Migrate shipping, invitation, review services
- [ ] Migrate admin and user services
- [ ] Test error responses include errorCode and action

### Phase 4: Remaining Services (Week 4)
- [ ] Migrate all remaining services
- [ ] Replace generic Error throws with appropriate exceptions
- [ ] Fix wrong status codes (e.g., NotFoundException for "required field")

### Phase 5: Validation & Documentation (Week 5)
- [ ] Run full test suite
- [ ] API testing of all error scenarios
- [ ] Create ERROR_HANDLING.md documentation
- [ ] Deprecate old BusinessException in src/exceptions/

---

## Expected Impact

### Before Migration
```json
{
  "statusCode": 404,
  "message": "Not Found",
  "error": "Store not found"
}
```

### After Migration
```json
{
  "statusCode": 404,
  "errorCode": 2001,
  "message": "Store not found",
  "details": {
    "resourceType": "Store",
    "resourceId": "invalid-store-id",
    "action": "verify_store_id",
    "suggestedAction": "Please verify the store ID and ensure you have access to this store"
  },
  "timestamp": "2026-01-27T10:30:00.000Z",
  "path": "/api/en/stores/invalid-store-id"
}
```

---

## Success Metrics

- **Coverage:** 100% of services use BusinessException pattern (from 4.4%)
- **Error Code:** Every error response includes numeric errorCode
- **Actionable:** Every error includes `details.action` field
- **Descriptive:** No more "Bad Request" or "Not Found" without context
- **Consistency:** All similar errors use same exception class and format
- **Frontend-Ready:** Error responses can be directly consumed by frontend for user-friendly display

---

## Risk Mitigation

### Breaking Changes
- **Risk:** Changing error response format might break frontend parsing
- **Mitigation:** All new fields are additions, maintain backward compatibility with statusCode and message

### Test Failures
- **Risk:** Existing tests might expect specific error messages
- **Mitigation:** Update tests incrementally with each service migration

### Over-Engineering
- **Risk:** Too many exception classes creates confusion
- **Mitigation:** Limit to 8 core classes that cover 95%+ of use cases

---

## Next Steps

1. **Review this plan** with the team for feedback
2. **Begin Phase 1** - Create new exception classes
3. **Migrate one service** as a proof-of-concept (suggest: product.service.ts)
4. **Validate** error responses in Postman/Swagger
5. **Document** the pattern for other developers
6. **Roll out** to remaining services incrementally

---

*Generated from error-audit-report.json on 2026-01-27*
*Total errors analyzed: 474 across 51 service files*
