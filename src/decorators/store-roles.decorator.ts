import { SetMetadata } from '@nestjs/common';
import { StoreMemberRole } from '../store/enum';
import { STORE_ROLES_KEY } from '../guards/store-role.guard';

/**
 * Decorator to specify required store roles for a route.
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
 * @StoreRoles(StoreMemberRole.ADMIN)
 *
 * @example
 * // Require at least MANAGER role (also allows ADMIN and OWNER)
 * @StoreRoles(StoreMemberRole.MANAGER)
 *
 * @example
 * // Allow either ADMIN or MANAGER (explicit)
 * @StoreRoles(StoreMemberRole.ADMIN, StoreMemberRole.MANAGER)
 */
export const StoreRoles = (...roles: StoreMemberRole[]) =>
  SetMetadata(STORE_ROLES_KEY, roles);

/**
 * Shorthand decorators for common role requirements
 */

/** Requires OWNER role */
export const RequireStoreOwner = () => StoreRoles(StoreMemberRole.OWNER);

/** Requires at least ADMIN role (includes OWNER) */
export const RequireStoreAdmin = () => StoreRoles(StoreMemberRole.ADMIN);

/** Requires at least MANAGER role (includes ADMIN, OWNER) */
export const RequireStoreManager = () => StoreRoles(StoreMemberRole.MANAGER);

/** Requires at least STAFF role (includes MANAGER, ADMIN, OWNER) */
export const RequireStoreStaff = () => StoreRoles(StoreMemberRole.STAFF);

/** Requires at least VIEWER role (any store member) */
export const RequireStoreMember = () => StoreRoles(StoreMemberRole.VIEWER);
