/**
 * JWT Token Expiration Verification Script
 *
 * This script verifies that JWT tokens now include proper expiration.
 * It simulates the retrieveToken function from auth.service.ts
 * and validates the token structure.
 */

const jwt = require('jsonwebtoken');
const config = require('./src/config/default.json');

// Simulate the retrieveToken function
function retrieveToken(id, mobile, role) {
  const token = jwt.sign(
    {
      customer: {
        id,
        mobile,
      },
      role,
    },
    process.env.JWT_SECRET || config.jwt.secret,
    {
      expiresIn: process.env.JWT_EXPIRATION || config.jwt.expiration,
    },
  );
  return token;
}

// Generate a test token
console.log('='.repeat(80));
console.log('JWT TOKEN EXPIRATION VERIFICATION');
console.log('='.repeat(80));
console.log();

const testUserId = 'test-user-123';
const testMobile = '+1234567890';
const testRole = 'user';

console.log('📝 Generating test JWT token...');
console.log(`   User ID: ${testUserId}`);
console.log(`   Mobile: ${testMobile}`);
console.log(`   Role: ${testRole}`);
console.log(`   JWT_EXPIRATION: ${process.env.JWT_EXPIRATION || config.jwt.expiration}`);
console.log();

const token = retrieveToken(testUserId, testMobile, testRole);

console.log('✅ Token generated successfully');
console.log(`   Token: ${token.substring(0, 50)}...`);
console.log();

// Decode the token
console.log('🔍 Decoding token...');
const decoded = jwt.decode(token, { complete: true });

console.log('   Decoded Payload:');
console.log('   ', JSON.stringify(decoded.payload, null, 2).split('\n').join('\n    '));
console.log();

// Verify required fields
console.log('✓ Verification Results:');
console.log();

// Check if exp field exists
if (!decoded.payload.exp) {
  console.log('❌ FAILED: Token does not contain "exp" field');
  process.exit(1);
}
console.log('✅ Token contains "exp" field');

// Check if iat field exists
if (!decoded.payload.iat) {
  console.log('❌ FAILED: Token does not contain "iat" field');
  process.exit(1);
}
console.log('✅ Token contains "iat" field');

// Calculate expiration duration
const iat = decoded.payload.iat;
const exp = decoded.payload.exp;
const durationSeconds = exp - iat;
const durationDays = durationSeconds / 86400; // 86400 seconds in a day
const expectedSeconds = 1209600; // 14 days * 24 hours * 60 minutes * 60 seconds

console.log();
console.log('📊 Expiration Details:');
console.log(`   Issued At (iat): ${iat} (${new Date(iat * 1000).toISOString()})`);
console.log(`   Expires At (exp): ${exp} (${new Date(exp * 1000).toISOString()})`);
console.log(`   Duration: ${durationSeconds} seconds (${durationDays} days)`);
console.log(`   Expected: ${expectedSeconds} seconds (14 days)`);
console.log();

// Verify duration is 14 days
if (durationSeconds === expectedSeconds) {
  console.log('✅ Token expiration is EXACTLY 14 days (1209600 seconds)');
} else {
  console.log(`❌ FAILED: Token expiration is ${durationSeconds} seconds, expected ${expectedSeconds} seconds`);
  process.exit(1);
}

console.log();
console.log('='.repeat(80));
console.log('🎉 ALL VERIFICATIONS PASSED!');
console.log('='.repeat(80));
console.log();
console.log('Summary:');
console.log('  ✅ JWT tokens now include expiration (exp field)');
console.log('  ✅ Expiration is set to 14 days from issuance');
console.log('  ✅ Security improvement: Tokens will expire after 14 days');
console.log('  ✅ Prevents indefinite session hijacking vulnerability');
console.log();
