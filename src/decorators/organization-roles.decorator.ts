import { SetMetadata } from '@nestjs/common';
import { OrganizationMemberRole } from '../organization/enum';
import { ORGANIZATION_ROLES_KEY } from '../guards/organization-role.guard';

/**
 * Decorator to specify required organization roles for a route.
 * Uses role hierarchy - users with higher roles can access routes requiring lower roles.
 *
 * Role hierarchy (highest to lowest):
 * - OWNER: Full access to everything
 * - ADMIN: Can manage members, settings, but cannot transfer ownership
 * - MANAGER: Can manage products, orders, customers
 * - STAFF: Can view and update orders, inventory
 * - VIEWER: Read-only access
 *
 * @example
 * // Require at least ADMIN role
 * @OrganizationRoles(OrganizationMemberRole.ADMIN)
 *
 * @example
 * // Require at least MANAGER role (also allows ADMIN and OWNER)
 * @OrganizationRoles(OrganizationMemberRole.MANAGER)
 *
 * @example
 * // Allow either ADMIN or MANAGER (explicit)
 * @OrganizationRoles(OrganizationMemberRole.ADMIN, OrganizationMemberRole.MANAGER)
 */
export const OrganizationRoles = (...roles: OrganizationMemberRole[]) =>
  SetMetadata(ORGANIZATION_ROLES_KEY, roles);

/**
 * Shorthand decorators for common role requirements
 */

/** Requires OWNER role */
export const RequireOwner = () => OrganizationRoles(OrganizationMemberRole.OWNER);

/** Requires at least ADMIN role (includes OWNER) */
export const RequireAdmin = () => OrganizationRoles(OrganizationMemberRole.ADMIN);

/** Requires at least MANAGER role (includes ADMIN, OWNER) */
export const RequireManager = () => OrganizationRoles(OrganizationMemberRole.MANAGER);

/** Requires at least STAFF role (includes MANAGER, ADMIN, OWNER) */
export const RequireStaff = () => OrganizationRoles(OrganizationMemberRole.STAFF);

/** Requires at least VIEWER role (any organization member) */
export const RequireMember = () => OrganizationRoles(OrganizationMemberRole.VIEWER);
