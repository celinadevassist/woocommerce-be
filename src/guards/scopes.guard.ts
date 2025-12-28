import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scopes = this.reflector.get<string[]>('scopes', context.getHandler());
    if (!scopes) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const hasScope = () => scopes.some((scope) => {
      return user.scopes.includes(`*:*`) ||
      user.scopes.includes(`${scope.split(':')[0]}:*`) ||
      user.scopes.includes(scope);
    });
    return user && user.scopes && hasScope();
  }
}
