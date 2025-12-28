import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization, OrganizationDocument } from '../organization/schema';
import { OrganizationMemberRole } from '../organization/enum';

export const ORGANIZATION_ROLES_KEY = 'organizationRoles';

// Role hierarchy - higher roles include permissions of lower roles
const ROLE_HIERARCHY: Record<OrganizationMemberRole, number> = {
  [OrganizationMemberRole.OWNER]: 100,
  [OrganizationMemberRole.ADMIN]: 80,
  [OrganizationMemberRole.MANAGER]: 60,
  [OrganizationMemberRole.STAFF]: 40,
  [OrganizationMemberRole.VIEWER]: 20,
};

@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationMemberRole[]>(
      ORGANIZATION_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get organization ID from various sources
    const organizationId = this.getOrganizationId(request);

    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    // Get the organization
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user is owner
    const userId = user._id?.toString() || user.id?.toString();
    if (organization.ownerId.toString() === userId) {
      // Owner has all permissions
      request.organizationRole = OrganizationMemberRole.OWNER;
      request.organization = organization;
      return true;
    }

    // Find user's membership
    const member = organization.members.find(
      (m) => m.userId.toString() === userId,
    );

    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const userRole = member.role as OrganizationMemberRole;
    const userRoleLevel = ROLE_HIERARCHY[userRole] || 0;

    // Check if user's role meets the minimum required role
    const hasRequiredRole = requiredRoles.some((requiredRole) => {
      const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
      return userRoleLevel >= requiredLevel;
    });

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    // Attach role and organization to request for downstream use
    request.organizationRole = userRole;
    request.organizationMember = member;
    request.organization = organization;

    return true;
  }

  private getOrganizationId(request: any): string | null {
    // Check various sources for organization ID
    return (
      request.params?.organizationId ||
      request.body?.organizationId ||
      request.query?.organizationId ||
      request.headers['x-organization-id'] ||
      null
    );
  }
}
