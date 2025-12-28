import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const REQUIRE_EMAIL_VERIFICATION_KEY = 'requireEmailVerification';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireEmailVerification = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_EMAIL_VERIFICATION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requireEmailVerification) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException({
        message: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
        emailVerified: false
      });
    }

    return true;
  }
}

// Decorator to mark routes that require email verification
import { SetMetadata } from '@nestjs/common';

export const RequireEmailVerification = () => 
  SetMetadata(REQUIRE_EMAIL_VERIFICATION_KEY, true);