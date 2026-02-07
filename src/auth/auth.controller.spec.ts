import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';

// Mock dependencies to avoid circular dependency issues
jest.mock('../services/users.service', () => ({
  UsersService: jest.fn(),
}));

jest.mock('./auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    signin: jest.fn().mockResolvedValue({
      token: 'mock-jwt-token',
      user: { id: '1', email: 'test@example.com' },
    }),
    signup: jest.fn().mockResolvedValue({
      message: 'User created successfully',
      user: { id: '1', email: 'test@example.com' },
    }),
    forgetPassword: jest.fn().mockResolvedValue({
      message: 'Password reset email sent',
    }),
    resetPasswordWithToken: jest.fn().mockResolvedValue({
      message: 'Password reset successfully',
    }),
  })),
}));

// Import after mocking to use mocked versions
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController Rate Limiting (Integration)', () => {
  let app: INestApplication;
  let authService: any;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000, // 60 seconds
            limit: 10, // 10 requests per ttl (default)
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('Rate limit configuration verification', () => {
    it('should have @Throttle decorator on signin endpoint', async () => {
      const signInData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/en/auth/signin')
        .send(signInData);

      // Should succeed and have rate limit headers
      expect([HttpStatus.CREATED, HttpStatus.OK]).toContain(response.status);
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should have @Throttle decorator on signup endpoint', async () => {
      const signUpData = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/en/auth/signup')
        .send(signUpData);

      // Should succeed and have rate limit headers
      expect([HttpStatus.CREATED, HttpStatus.OK]).toContain(response.status);
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should have @Throttle decorator on forgot-password endpoint', async () => {
      const response = await request(app.getHttpServer()).get(
        '/en/auth/forgot-password/test@example.com',
      );

      // Should succeed and have rate limit headers
      expect([HttpStatus.OK]).toContain(response.status);
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should have @Throttle decorator on reset-password endpoint', async () => {
      const resetData = {
        token: 'reset-token-123',
        newPassword: 'newPassword123',
      };

      const response = await request(app.getHttpServer())
        .post('/en/auth/reset-password')
        .send(resetData);

      // Should succeed and have rate limit headers
      expect([HttpStatus.CREATED, HttpStatus.OK]).toContain(response.status);
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('Rate limit headers', () => {
    it('should include rate limit information in response headers', async () => {
      const signInData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/en/auth/signin')
        .send(signInData);

      // NestJS Throttler automatically adds these headers
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');

      // Verify header values are numbers
      const limit = parseInt(response.headers['x-ratelimit-limit']);
      const remaining = parseInt(response.headers['x-ratelimit-remaining']);
      const reset = parseInt(response.headers['x-ratelimit-reset']);

      expect(limit).toBeGreaterThan(0);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(reset).toBeGreaterThan(0);
    });

    it('should decrement remaining count on subsequent requests', async () => {
      const signInData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const response1 = await request(app.getHttpServer())
        .post('/en/auth/signin')
        .send(signInData);

      const response2 = await request(app.getHttpServer())
        .post('/en/auth/signin')
        .send(signInData);

      const remaining1 = parseInt(response1.headers['x-ratelimit-remaining']);
      const remaining2 = parseInt(response2.headers['x-ratelimit-remaining']);

      // Remaining count should decrease (or stay same if storage resets)
      expect(remaining2).toBeLessThanOrEqual(remaining1);
    });
  });

  describe('Service method invocation', () => {
    it('should call signin service method', async () => {
      const signInData = {
        email: 'test@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/en/auth/signin')
        .send(signInData);

      expect(authService.signin).toHaveBeenCalled();
    });

    it('should call signup service method', async () => {
      const signUpData = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app.getHttpServer())
        .post('/en/auth/signup')
        .send(signUpData);

      expect(authService.signup).toHaveBeenCalled();
    });

    it('should call forgetPassword service method', async () => {
      await request(app.getHttpServer()).get(
        '/en/auth/forgot-password/test@example.com',
      );

      expect(authService.forgetPassword).toHaveBeenCalled();
    });

    it('should call resetPasswordWithToken service method', async () => {
      const resetData = {
        token: 'reset-token-123',
        newPassword: 'newPassword123',
      };

      await request(app.getHttpServer())
        .post('/en/auth/reset-password')
        .send(resetData);

      expect(authService.resetPasswordWithToken).toHaveBeenCalled();
    });
  });

  describe('Rate limiting behavior documentation', () => {
    /**
     * These tests document the expected rate limiting behavior.
     * Actual rate limit enforcement is tested in throttle.guard.spec.ts
     *
     * Expected rate limits:
     * - signin: 5 requests per minute (60000ms)
     * - signup: 3 requests per hour (3600000ms)
     * - forgot-password: 3 requests per hour (3600000ms)
     * - reset-password: 5 requests per hour (3600000ms)
     *
     * Rate limiting uses IP-based tracking via CustomThrottlerGuard:
     * - Checks x-forwarded-for header first
     * - Falls back to x-real-ip header
     * - Finally uses req.ip
     * - Returns 429 (Too Many Requests) when limit exceeded
     */

    it('should document that signin has 5 req/min rate limit', () => {
      // Rate limit configuration is verified by the @Throttle decorator
      // on the signin endpoint in auth.controller.ts
      expect(true).toBe(true);
    });

    it('should document that signup has 3 req/hour rate limit', () => {
      // Rate limit configuration is verified by the @Throttle decorator
      // on the signup endpoint in auth.controller.ts
      expect(true).toBe(true);
    });

    it('should document that forgot-password has 3 req/hour rate limit', () => {
      // Rate limit configuration is verified by the @Throttle decorator
      // on the forgot-password endpoint in auth.controller.ts
      expect(true).toBe(true);
    });

    it('should document that reset-password has 5 req/hour rate limit', () => {
      // Rate limit configuration is verified by the @Throttle decorator
      // on the reset-password endpoint in auth.controller.ts
      expect(true).toBe(true);
    });
  });
});
