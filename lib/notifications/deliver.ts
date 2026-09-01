import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRecipients, type PreferenceRow, type Recipient } from './preferences';
import type { NotificationDraft } from './types';

/**
 * Turning a drafted alert into inbox rows and Web Push messages.
 *
 * Detection lives in ./detect.ts and is pure; everything that touches the
 * network or the database is here, so the interesting decisions stay testable
 * without a database.
 */

let vapidConfigured: boolean | null = null;

/**
 * Push is optional infrastructure. A deployment without VAPID keys still writes
 * inbox rows and still shows the bell — it just does not buzz. That is a
 * degraded feature, not a broken one, and it must never take down the cron or a
 * payroll submission.
 */
function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;

  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn('[notifications] VAPID keys absent — in-app only, no push sent');
    vapidConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** Everyone in an org, with the role that decides their defaults. */
export async function getOrgRecipients(organizationId: string): Promise<Recipient[]> {
  const supabase = createAdminClient();
  // admin-scope-ok: `memberships` is the org↔user mapping itself and this query
  // filters it to the one organization passed in.
  const { data } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', organizationId);

  return (data ?? []).map((m) => ({
    userId: m.user_id as string,
    role:   m.role as Recipient['role'],
  }));
}

async function getPreferences(organizationId: string): Promise<PreferenceRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('notification_preferences')
    .select('user_id, event_type, muted')
    .eq('organization_id', organizationId);
  return (data ?? []) as PreferenceRow[];
}

/**
 * The most recent notification of a given type for an org, whoever received it.
 *
 * Low-stock edge detection reads the previous digest's payload to know what has
 * already been announced. Any recipient's copy will do — the payload is
 * identical across the fan-out.
 */
export async function getLastNotificationPayload(
  organizationId: string,
  eventType: string,
): Promise<Record<string, unknown> | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('notifications')
    .select('payload')
    .eq('organization_id', organizationId)
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.payload as Record<string, unknown> | undefined) ?? null;
}

/**
 * Fan a draft out to everyone who wants it, then push.
 *
 * Returns the number of people notified. Zero is a perfectly ordinary result —
 * everyone may have muted it.
 */
export async function dispatch(
  organizationId: string,
  draft: NotificationDraft,
  options: { recipients?: Recipient[]; preferences?: PreferenceRow[] } = {},
): Promise<number> {
  const recipients  = options.recipients  ?? await getOrgRecipients(organizationId);
  const preferences = options.preferences ?? await getPreferences(organizationId);

  const targets = resolveRecipients(recipients, draft.eventType, preferences);
  if (targets.length === 0) return 0;

  const supabase = createAdminClient();

  const rows = targets.map((t) => ({
    organization_id: organizationId,
    user_id:         t.userId,
    event_type:      draft.eventType,
    title:           draft.title,
    body:            draft.body,
    link:            draft.link ?? null,
    payload:         draft.payload ?? {},
    dedupe_key:      draft.dedupeKey,
  }));

  // ux_notifications_dedupe makes a repeat run a no-op rather than a duplicate
  // buzz. `ignoreDuplicates` means only genuinely new rows come back, so the
  // push loop below pushes exactly what was newly created.
  //
  // admin-scope-ok: every row in `rows` sets organization_id to the `organizationId`
  // argument, and its user_id comes from `targets`, which resolveRecipients()
  // derived from that same org's memberships. An insert cannot leak across
  // tenants — it can only write rows already stamped with this one.
  const { data: inserted, error } = await supabase
    .from('notifications')
    .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
    .select('id, user_id, title, body, link');

  if (error) {
    console.error('[notifications] insert failed:', error.message);
    return 0;
  }

  const created = inserted ?? [];
  if (created.length > 0) {
    await pushToUsers(organizationId, created);
  }
  return created.length;
}

type PushableNotification = {
  id:      string;
  user_id: string;
  title:   string;
  body:    string;
  link:    string | null;
};

/** Send one Web Push per registered device of each recipient. */
async function pushToUsers(
  organizationId: string,
  notifications: readonly PushableNotification[],
): Promise<void> {
  if (!ensureVapid()) return;

  const supabase = createAdminClient();
  const userIds  = [...new Set(notifications.map((n) => n.user_id))];

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('organization_id', organizationId)
    .in('user_id', userIds);

  if (!subs || subs.length === 0) return;

  const deadSubscriptionIds: string[] = [];

  const sends = notifications.flatMap((n) =>
    subs
      .filter((s) => s.user_id === n.user_id)
      .map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint as string,
              keys: { p256dh: s.p256dh as string, auth: s.auth as string },
            },
            JSON.stringify({
              title: n.title,
              body:  n.body,
              url:   n.link ?? '/app/dashboard',
              tag:   n.id,
            }),
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410 is the push service telling us this device is gone for
          // good. It is the only authoritative signal that a subscription is
          // dead, so it is the only thing that should delete one — a transient
          // 500 must not cost a manager their notifications.
          if (status === 404 || status === 410) {
            deadSubscriptionIds.push(s.id as string);
          } else {
            console.warn('[notifications] push failed:', status ?? e);
          }
        }
      }),
  );

  await Promise.all(sends);

  if (deadSubscriptionIds.length > 0) {
    // admin-scope-ok: these ids come from the push_subscriptions query above,
    // which was filtered by .eq('organization_id', organizationId).
    await supabase.from('push_subscriptions').delete().in('id', deadSubscriptionIds);
  }

  const ids = notifications.map((n) => n.id);
  // admin-scope-ok: `ids` are the rows just inserted for this organization by
  // dispatch(), which scoped them on the way in.
  await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', ids);
}
