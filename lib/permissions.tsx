import type { CurrentOrgResult } from './org';

export type Role = CurrentOrgResult['role'];

export const canEditInventory = (role: Role) =>
  role === 'owner' || role === 'manager';

export const canDeleteInventory = (role: Role) =>
  role === 'owner';

export const canAdjustStock = (role: Role) =>
  role === 'owner' || role === 'manager';

export const canManageCategories = (role: Role) =>
  role === 'owner' || role === 'manager';

export const canManageReps = (role: Role) =>
  role === 'owner' || role === 'manager';

/**
 * Correcting hours, moving tips between people, and naming the opener.
 *
 * Owner and manager only — deliberately not accountant. An accountant reports on
 * a pay run; deciding that one bartender's tips belong to another is an
 * operational call made by whoever was in the building.
 */
export const canManagePayroll = (role: Role) =>
  role === 'owner' || role === 'manager';
