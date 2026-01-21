import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleService } from '../services';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roleService: RoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scopes = this.reflector.get<string[]>('scopes', context.getHandler());
    if (!scopes) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const role = request.user?.role;
    const roleData = await this.roleService.getByName(role, 'en');
    const UserScopes = roleData?.scopes;
    if (!UserScopes) {
      return false;
    }
    const hasScope = () =>
      scopes.some((scope) => {
        return (
          UserScopes.includes(`*:*`) ||
          UserScopes.includes(`${scope.split(':')[0]}:*`) ||
          UserScopes.includes(scope)
        );
      });
    return user && UserScopes && hasScope();
  }
}
