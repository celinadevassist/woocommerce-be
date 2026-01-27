import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomThrottlerGuard } from './throttle.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(() => {
    // Create guard with minimal required dependencies
    const options = {
      throttlers: [{ ttl: 60000, limit: 10 }],
    };
    const storageService = {
      increment: jest.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60000 }),
    };
    const reflector = new Reflector();

    guard = new CustomThrottlerGuard(options, storageService as any, reflector);
  });

  describe('getTracker', () => {
    it('should extract IP from x-forwarded-for header (string)', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.2',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.1');
    });

    it('should extract IP from x-forwarded-for header (array)', async () => {
      const req = {
        headers: {
          'x-forwarded-for': ['203.0.113.1', '198.51.100.2'],
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.1');
    });

    it('should handle x-forwarded-for with single IP', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.1');
    });

    it('should trim whitespace from x-forwarded-for IP', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '  203.0.113.1  , 198.51.100.2',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.1');
    });

    it('should fall back to x-real-ip header (string)', async () => {
      const req = {
        headers: {
          'x-real-ip': '203.0.113.5',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.5');
    });

    it('should fall back to x-real-ip header (array)', async () => {
      const req = {
        headers: {
          'x-real-ip': ['203.0.113.5', '198.51.100.2'],
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.5');
    });

    it('should fall back to req.ip', async () => {
      const req = {
        headers: {},
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('192.168.1.1');
    });

    it('should return "unknown" when no IP is available', async () => {
      const req = {
        headers: {},
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('unknown');
    });

    it('should prioritize x-forwarded-for over x-real-ip', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1',
          'x-real-ip': '203.0.113.5',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.1');
    });

    it('should prioritize x-forwarded-for over req.ip', async () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.1');
    });

    it('should prioritize x-real-ip over req.ip', async () => {
      const req = {
        headers: {
          'x-real-ip': '203.0.113.5',
        },
        ip: '192.168.1.1',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('203.0.113.5');
    });

    it('should handle undefined req.ip', async () => {
      const req = {
        headers: {},
        ip: undefined,
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('unknown');
    });

    it('should handle null req.ip', async () => {
      const req = {
        headers: {},
        ip: null,
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('unknown');
    });

    it('should handle empty string req.ip', async () => {
      const req = {
        headers: {},
        ip: '',
      };

      const result = await guard['getTracker'](req);

      expect(result).toBe('unknown');
    });
  });
});
