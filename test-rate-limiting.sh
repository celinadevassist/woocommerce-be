#!/bin/bash
# Rate Limiting Test Script
# Tests the authentication endpoints rate limiting implementation

echo "======================================"
echo "Rate Limiting Manual Verification Test"
echo "======================================"
echo ""

# Test signin endpoint (5 requests per minute)
echo "Testing /api/en/auth/signin endpoint (limit: 5 requests/minute)"
echo "Making 6 rapid requests..."
echo ""

for i in 1 2 3 4 5 6; do
  echo "--- Request $i ---"
  curl -i -X POST http://localhost:3041/api/en/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test123"}' \
    2>&1 | grep -E "HTTP/|X-RateLimit|Too Many|429"
  echo ""
  sleep 0.5
done

echo ""
echo "Expected Results:"
echo "- Requests 1-5 should return HTTP status (200, 400, or 401)"
echo "- Request 6 should return HTTP 429 (Too Many Requests)"
echo "- All responses should include X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers"
echo ""
echo "To test recovery after rate limit:"
echo "  1. Wait 60 seconds"
echo "  2. Re-run this script"
echo "  3. Verify requests work again"
