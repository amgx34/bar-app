import { ROLE_DEFAULTS, type EventType } from './types';
import type { Role } from '@/lib/permissions';

export type PreferenceRow = {
  user_id:    string;
  event_type: string;
  muted:      boolean;
};

export type Recipient = {
  userId: string;
  role:   Role;
};

/**
 * Whether one person should be told about one event.
 *
 * A missing preference row means "use the role default" — that is the whole
 * reason the table stores only explicit choices. Adding a new event type then
 * behaves correctly for every existing user without a backfill, and a user who
 * has never opened Settings still gets the alerts that matter to their role.
 *
 * An explicit row always wins, in both directions: a manager can mute low stock,
 * and an accountant can opt IN to it, without either being a special case here.
 */
export function wantsNotification(
  recipient: Recipient,
  eventType: EventType,
  preferences: readonly PreferenceRow[],
): boolean {
  const explicit = preferences.find(
    (p) => p.user_id === recipient.userId && p.event_type === eventType,
  );
  if (explicit) return !explicit.muted;

  return ROLE_DEFAULTS[recipient.role]?.includes(eventType) ?? false;
}

/** The subset of `recipients` who should receive `eventType`. */
export function resolveRecipients(
  recipients: readonly Recipient[],
  eventType: EventType,
  preferences: readonly PreferenceRow[],
): Recipient[] {
  return recipients.filter((r) => wantsNotification(r, eventType, preferences));
}
