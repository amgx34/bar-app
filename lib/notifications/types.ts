import type { Role } from '@/lib/permissions';

/**
 * Every kind of alert the system can raise.
 *
 * The string values are stored in `notifications.event_type` and in
 * `notification_preferences`, so they are a data contract — rename one and you
 * orphan every stored preference row referring to it.
 */
export const EVENT_TYPES = [
  'inventory.low_stock',
  'sales.z_report_closed',
  'sales.anomaly',
  'payroll.approval_needed',
  'payroll.approved',
  'payroll.changes_requested',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Human labels for the Settings → Notifications toggles. */
export const EVENT_LABELS: Record<EventType, { title: string; description: string }> = {
  'inventory.low_stock': {
    title:       'Low stock',
    description: 'A nightly digest of items that have dropped below their par level.',
  },
  'sales.z_report_closed': {
    title:       'Nightly sales',
    description: "Last night's totals once the Z report lands.",
  },
  'sales.anomaly': {
    title:       'Unusual sales',
    description: 'When a night runs well above or below the same weekday over the last four weeks.',
  },
  'payroll.approval_needed': {
    title:       'Payroll awaiting approval',
    description: 'A pay period has been submitted and needs an owner to sign off.',
  },
  'payroll.approved': {
    title:       'Payroll approved',
    description: 'A pay period you submitted has been approved.',
  },
  'payroll.changes_requested': {
    title:       'Payroll sent back',
    description: 'A pay period you submitted needs changes.',
  },
};

/**
 * Who hears about what when nobody has changed their settings.
 *
 * Managers are absent from `payroll.approval_needed` because they are the ones
 * submitting — telling the submitter their own request arrived is noise.
 * Accountants get payroll only, mirroring canManagePayroll in lib/permissions:
 * an accountant reports on a pay run, they do not make the operational call
 * about a bottle of well vodka.
 */
export const ROLE_DEFAULTS: Record<Role, readonly EventType[]> = {
  owner: [
    'inventory.low_stock',
    'sales.z_report_closed',
    'sales.anomaly',
    'payroll.approval_needed',
    'payroll.approved',
    'payroll.changes_requested',
  ],
  manager: [
    'inventory.low_stock',
    'sales.z_report_closed',
    'sales.anomaly',
    'payroll.approved',
    'payroll.changes_requested',
  ],
  accountant: [
    'payroll.approval_needed',
    'payroll.approved',
    'payroll.changes_requested',
  ],
};

/** One alert, before it is fanned out to recipients. */
export type NotificationDraft = {
  eventType: EventType;
  title:     string;
  body:      string;
  /** In-app destination. Also the URL the push notification opens. */
  link?:     string;
  payload?:  Record<string, unknown>;
  /**
   * Makes re-delivery a no-op. Must be stable for "the same event" and
   * different for a genuinely new one — hence the date component on the
   * periodic ones and the run id on payroll.
   */
  dedupeKey: string;
};
