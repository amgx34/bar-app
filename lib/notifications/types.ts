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
  'sales.tax_daily',
  'tips.hourly',
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
  'sales.tax_daily': {
    title:       'Sales tax to set aside',
    description: "How much of last night's take belongs to the state. Silent until a tax rate is set.",
  },
  'tips.hourly': {
    title:       'Tips per hour',
    description: 'What last night paid per recorded hour on the floor, across the whole bar.',
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
 * Accountants get payroll and sales tax, and nothing else: they report on a pay
 * run and on money held for the state, but do not make the operational call
 * about a bottle of well vodka. `sales.tax_daily` is the one non-payroll alert
 * they receive by default, because remitting that liability is squarely their
 * job — not because the general sales feed became relevant to them.
 *
 * Managers get `tips.hourly` but not `sales.tax_daily`. What the night paid per
 * hour is a staffing question, which is theirs; what is owed to the state is a
 * filing question, which is not.
 */
export const ROLE_DEFAULTS: Record<Role, readonly EventType[]> = {
  owner: [
    'inventory.low_stock',
    'sales.z_report_closed',
    'sales.anomaly',
    'sales.tax_daily',
    'tips.hourly',
    'payroll.approval_needed',
    'payroll.approved',
    'payroll.changes_requested',
  ],
  manager: [
    'inventory.low_stock',
    'sales.z_report_closed',
    'sales.anomaly',
    'tips.hourly',
    'payroll.approved',
    'payroll.changes_requested',
  ],
  accountant: [
    'sales.tax_daily',
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
