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

/** Freezing a pay period and sending it up for sign-off. */
export const canSubmitPayroll = (role: Role) =>
  role === 'owner' || role === 'manager';

/**
 * Signing off a pay run, and overriding the approval gate on a NACHA export.
 *
 * Owner only — separating submitter from approver is the entire point of the
 * workflow. Note that most bars are one owner and no managers, so an owner who
 * submits may approve their own run; the run records both fields as the same
 * user rather than blocking on a second person who does not exist.
 */
export const canApprovePayroll = (role: Role) =>
  role === 'owner';
