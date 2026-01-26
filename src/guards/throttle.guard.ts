import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Extract IP from request, handling proxy scenarios
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = req.ip;

    // Priority: x-forwarded-for > x-real-ip > req.ip
    if (forwarded) {
      // x-forwarded-for can contain multiple IPs, take the first one
      return typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : forwarded[0];
    }

    if (realIp) {
      return typeof realIp === 'string' ? realIp : realIp[0];
    }

    return ip || 'unknown';
  }
}
