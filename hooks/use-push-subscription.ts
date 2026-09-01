'use client';

import { useState, useEffect, useCallback } from 'react';
import { subscribeToPush, unsubscribeFromPush } from '@/app/(app)/app/actions/notifications';

/**
 * Registering this browser for Web Push.
 *
 * The permission prompt is NEVER fired from here on mount. It only runs from an
 * explicit button press, because a prompt on page load is the most reliable way
 * to get permanently blocked — and `denied` is not recoverable in-app, on any
 * browser. Once a user blocks Rail, the only fix is browser settings.
 */

/**
 * VAPID keys travel as URL-safe base64; `pushManager.subscribe` wants bytes.
 *
 * Backed by an explicit ArrayBuffer rather than the bare `new Uint8Array(n)`
 * form: current lib.dom types a plain Uint8Array over ArrayBufferLike, which
 * includes SharedArrayBuffer and so is not assignable to BufferSource.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * iOS grants push only to a PWA launched from the Home Screen. In Safari's
 * normal browsing view the API is simply absent, so a button would do nothing —
 * the UI has to show install instructions instead of pretending it can help.
 */
function detectIosNeedsInstall(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return false;

  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export type PushState = {
  /** The browser has the APIs at all. */
  supported:       boolean;
  /** iOS Safari that must be added to the Home Screen first. */
  needsInstall:    boolean;
  permission:      NotificationPermission | 'unsupported';
  subscribed:      boolean;
  busy:            boolean;
  error:           string | null;
};

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    supported:    false,
    needsInstall: false,
    permission:   'unsupported',
    subscribed:   false,
    busy:         false,
    error:        null,
  });

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const needsInstall = detectIosNeedsInstall();

    if (!supported) {
      setState((s) => ({ ...s, supported: false, needsInstall }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Registering the worker is not the same as asking permission — this is
        // safe on mount and is what makes the "Enable" button instant later.
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setState((s) => ({
          ...s,
          supported:    true,
          needsInstall,
          permission:   Notification.permission,
          subscribed:   existing !== null,
        }));
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({ ...s, supported: false, error: String(e) }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState((s) => ({
          ...s, busy: false, permission,
          error: permission === 'denied'
            ? 'Notifications are blocked for this site. You will need to re-allow them in your browser settings.'
            : null,
        }));
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setState((s) => ({ ...s, busy: false, error: 'Push is not configured on this deployment.' }));
        return;
      }

      const sub = await reg.pushManager.subscribe({
        // Required by every browser: a push must always be visible to the user.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const serialized = JSON.parse(JSON.stringify(sub)) as {
        endpoint: string; keys: { p256dh: string; auth: string };
      };
      const res = await subscribeToPush(serialized, navigator.userAgent);

      setState((s) => ({
        ...s, busy: false, permission, subscribed: res.ok, error: res.error ?? null,
      }));
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: String(e) }));
    }
  }, []);

  const disable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Server first: if the local unsubscribe succeeded but the row survived,
        // the backend would keep pushing to a dead endpoint until a 410 reaped it.
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState((s) => ({ ...s, busy: false, subscribed: false }));
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: String(e) }));
    }
  }, []);

  return { ...state, enable, disable };
}
