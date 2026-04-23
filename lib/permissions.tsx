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