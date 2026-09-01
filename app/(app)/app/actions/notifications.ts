'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg, getAuthUser } from '@/lib/org';
import { ROLE_DEFAULTS, EVENT_TYPES, type EventType } from '@/lib/notifications/types';

export type AppNotification = {
  id:         string;
  event_type: string;
  title:      string;
  body:       string;
  link:       string | null;
  is_read:    boolean;
  created_at: string;
};

/**
 * The current user's alerts for the active org.
 *
 * Scoped by user AND org: a person who manages two bars should not see one
 * bar's low-stock digest while the other is selected.
 */
export async function getNotifications(): Promise<AppNotification[]> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, event_type, title, body, link, is_read, created_at')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60);

  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return;

  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org.id)
    .eq('user_id', user.id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return;

  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('is_read', false);
}

export async function deleteNotification(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return;

  const supabase = createAdminClient();
  await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)
    .eq('user_id', user.id);
}

// ── Push subscriptions ───────────────────────────────────────────────────────

export type SerializedSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Register this browser for push.
 *
 * Upserts on `endpoint` because the push service treats the endpoint as the
 * device identity — a browser that re-subscribes (after a permission reset, or
 * a key rotation) must replace its row, not add a second one that would make
 * every alert arrive twice.
 */
export async function subscribeToPush(
  sub: SerializedSubscription,
  userAgent?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: 'Incomplete push subscription' };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id:         user.id,
      organization_id: org.id,
      endpoint:        sub.endpoint,
      p256dh:          sub.keys.p256dh,
      auth:            sub.keys.auth,
      user_agent:      userAgent ?? null,
      last_seen_at:    new Date().toISOString(),
    }, { onConflict: 'endpoint' });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/app/settings');
  return { ok: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const user = await getAuthUser();
  if (!user) return;

  const supabase = createAdminClient();
  // admin-scope-ok: a push endpoint belongs to exactly one device and this
  // deletes only rows that also match the calling user, so no other tenant's
  // subscription is reachable through it.
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);

  revalidatePath('/app/settings');
}

export type RegisteredDevice = {
  id:           string;
  user_agent:   string | null;
  created_at:   string;
  last_seen_at: string;
};

export async function getRegisteredDevices(): Promise<RegisteredDevice[]> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, user_agent, created_at, last_seen_at')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: false });

  return (data ?? []) as RegisteredDevice[];
}

export async function revokeDevice(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return;

  const supabase = createAdminClient();
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)
    .eq('user_id', user.id);

  revalidatePath('/app/settings');
}

// ── Preferences ──────────────────────────────────────────────────────────────

/**
 * The user's effective setting for every event type.
 *
 * Rows exist only for explicit choices, so this folds the role defaults in and
 * hands the UI a complete picture — the toggles then show what will actually
 * happen rather than a wall of empty state.
 */
export async function getNotificationPreferences(): Promise<Record<EventType, boolean>> {
  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();

  const defaults = Object.fromEntries(
    EVENT_TYPES.map((e) => [e, ROLE_DEFAULTS[role]?.includes(e) ?? false]),
  ) as Record<EventType, boolean>;

  if (!user) return defaults;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('notification_preferences')
    .select('event_type, muted')
    .eq('organization_id', org.id)
    .eq('user_id', user.id);

  for (const row of data ?? []) {
    const key = row.event_type as EventType;
    if (key in defaults) defaults[key] = !row.muted;
  }
  return defaults;
}

export async function setNotificationPreference(
  eventType: EventType,
  enabled: boolean,
): Promise<void> {
  const { org } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return;

  if (!EVENT_TYPES.includes(eventType)) return;

  const supabase = createAdminClient();
  // Always writes a row, even when the choice matches the role default. The
  // alternative — deleting the row to "return to default" — would silently
  // change a user's settings if their role changed later.
  await supabase
    .from('notification_preferences')
    .upsert({
      user_id:         user.id,
      organization_id: org.id,
      event_type:      eventType,
      muted:           !enabled,
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'user_id,organization_id,event_type' });

  revalidatePath('/app/settings');
}
