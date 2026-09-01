'use client';

import { useState, useTransition } from 'react';
import { Bell, BellOff, Smartphone, Trash2, Share } from 'lucide-react';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import { setNotificationPreference, revokeDevice } from '../../actions/notifications';
import { EVENT_LABELS, EVENT_TYPES, type EventType } from '@/lib/notifications/types';
import type { RegisteredDevice } from '../../actions/notifications';

/**
 * Short label for a device row. The full UA string is unreadable and would wrap
 * over three lines; "Chrome on Windows" is what a person needs to decide which
 * of their devices to revoke.
 */
function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua)     ? 'Edge'    :
    /OPR\//.test(ua)     ? 'Opera'   :
    /Chrome\//.test(ua)  ? 'Chrome'  :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua)  ? 'Safari'  : 'Browser';
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'     :
    /Android/.test(ua)          ? 'Android' :
    /Windows/.test(ua)          ? 'Windows' :
    /Mac OS X/.test(ua)         ? 'macOS'   :
    /Linux/.test(ua)            ? 'Linux'   : 'device';
  return `${browser} on ${os}`;
}

export function NotificationsTab({
  initialPreferences,
  initialDevices,
}: {
  initialPreferences: Record<EventType, boolean>;
  initialDevices: RegisteredDevice[];
}) {
  const push = usePushSubscription();
  const [prefs, setPrefs] = useState(initialPreferences);
  const [devices, setDevices] = useState(initialDevices);
  const [, start] = useTransition();

  function toggle(eventType: EventType) {
    const next = !prefs[eventType];
    setPrefs((p) => ({ ...p, [eventType]: next }));
    start(async () => { await setNotificationPreference(eventType, next); });
  }

  function removeDevice(id: string) {
    setDevices((d) => d.filter((x) => x.id !== id));
    start(async () => { await revokeDevice(id); });
  }

  return (
    <div className="space-y-8">
      {/* ── Push on this device ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Push notifications</h2>
          <p className="text-sm text-muted-foreground">
            Get alerts on this device even when Rail is closed.
          </p>
        </div>

        {push.needsInstall ? (
          // iOS grants push only to a Home Screen app. A button here would do
          // nothing, so it shows the one action that actually helps instead.
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Share className="h-4 w-4" /> Add Rail to your Home Screen first
            </p>
            <p className="text-sm text-muted-foreground">
              On iPhone and iPad, Safari only allows notifications for apps installed to the
              Home Screen. Tap the Share button, then <strong>Add to Home Screen</strong>, and
              open Rail from that icon to turn them on.
            </p>
          </div>
        ) : !push.supported ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-4">
            This browser does not support push notifications. Alerts will still appear in the
            bell at the top of the page.
          </p>
        ) : (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {push.subscribed
                ? <Bell className="h-4 w-4 text-primary" />
                : <BellOff className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">
                  {push.subscribed ? 'Enabled on this device' : 'Not enabled on this device'}
                </p>
                {push.permission === 'denied' && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Blocked in your browser settings — Rail cannot re-ask.
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={push.subscribed ? push.disable : push.enable}
              disabled={push.busy || push.permission === 'denied'}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
            >
              {push.busy ? 'Working…' : push.subscribed ? 'Turn off' : 'Enable on this device'}
            </button>
          </div>
        )}

        {push.error && <p className="text-sm text-destructive">{push.error}</p>}
      </section>

      {/* ── Registered devices ─────────────────────────────────────────────── */}
      {devices.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your devices</h2>
          <div className="rounded-lg border divide-y">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm">{describeDevice(d.user_agent)}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeDevice(d.id)}
                  aria-label="Remove device"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── What you hear about ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">What you get told about</h2>
          <p className="text-sm text-muted-foreground">
            These apply to the bell and to push. Defaults follow your role.
          </p>
        </div>

        <div className="rounded-lg border divide-y">
          {EVENT_TYPES.map((eventType) => {
            const label = EVENT_LABELS[eventType];
            const on = prefs[eventType];
            return (
              <label
                key={eventType}
                className="flex items-start justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(eventType)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                />
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
