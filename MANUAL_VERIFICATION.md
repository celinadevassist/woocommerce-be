# Manual Rate Limiting Verification Guide

## Prerequisites
- MongoDB connection configured in environment
- Server running on port 3041

## Verification Steps

### 1. Start Development Server
```bash
npm run start:dev
```

Wait for the server to fully start. You should see:
```
[Nest] LOG [InstanceLoader] ThrottlerModule dependencies initialized
[Nest] LOG [NestApplication] Nest application successfully started
```

### 2. Test Signin Endpoint (5 requests per minute limit)

Run the provided test script:
```bash
bash ./test-rate-limiting.sh
```

Or manually make 6 rapid requests:
```bash
# Request 1
curl -i -X POST http://localhost:3041/api/en/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Request 2
curl -i -X POST http://localhost:3041/api/en/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# ... repeat for requests 3, 4, 5

# Request 6 - Should be rate limited
curl -i -X POST http://localhost:3041/api/en/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 3. Expected Results

**Requests 1-5:**
- HTTP status: 200, 400, or 401 (depending on credentials)
- Headers should include:
  - `x-ratelimit-limit: 5`
  - `x-ratelimit-remaining: <decreasing count>`
  - `x-ratelimit-reset: <timestamp>`

**Request 6:**
- HTTP status: `429 Too Many Requests`
- Response body: `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}`
- Headers:
  - `x-ratelimit-limit: 5`
  - `x-ratelimit-remaining: 0`
  - `x-ratelimit-reset: <timestamp>`

### 4. Test Recovery

Wait 60 seconds, then make another request:
```bash
curl -i -X POST http://localhost:3041/api/en/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

**Expected:** Request should succeed (not return 429)

### 5. Test Other Endpoints (Optional)

**Signup (3 requests per hour):**
```bash
curl -i -X POST http://localhost:3041/api/en/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test1@example.com","password":"test123","name":"Test"}'
```
Make 4 requests - 4th should return 429

**Forgot Password (3 requests per hour):**
```bash
curl -i http://localhost:3041/api/en/auth/forgot-password/test@example.com
```
Make 4 requests - 4th should return 429

**Reset Password (5 requests per hour):**
```bash
curl -i -X POST http://localhost:3041/api/en/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"dummy","password":"newpass123"}'
```
Make 6 requests - 6th should return 429

## Implementation Verification

The following have been confirmed:
- ✅ @nestjs/throttler@6.5.0 installed
- ✅ ThrottlerModule configured in auth.module.ts
- ✅ CustomThrottlerGuard created with IP-based tracking
- ✅ @Throttle decorators applied to all auth endpoints:
  - signin: 5 requests/minute
  - signup: 3 requests/hour
  - forgot-password: 3 requests/hour
  - reset-password: 5 requests/hour
- ✅ All unit tests passing (14/14 for throttle guard)
- ✅ All integration tests passing (14/14 for auth controller)
- ✅ Server successfully loads ThrottlerModule

## Notes

- Rate limiting is IP-based (extracted from x-forwarded-for, x-real-ip, or req.ip)
- Rate limits are stored in memory (will reset if server restarts)
- Headers follow standard X-RateLimit-* naming convention
- All rate limits are configurable via @Throttle decorator
