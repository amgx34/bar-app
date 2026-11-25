import { DEMO_TTL_HOURS } from './constants';

export type DemoTimeLeft = { expired: boolean; urgent: boolean; label: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Null when the account's creation time is unreadable: say nothing rather than guess. */
export function demoTimeLeft(createdAt: string | null | undefined, now: Date): DemoTimeLeft | null {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  if (Number.isNaN(created)) return null;
  const ms = created + DEMO_TTL_HOURS * 3_600_000 - now.getTime();
  if (ms <= 0) return { expired: true, urgent: true, label: '' };
  const mins = Math.ceil(ms / 60_000);
  if (mins > 120) return { expired: false, urgent: false, label: plural(Math.floor(mins / 60), 'hour') };
  const h = Math.floor(mins / 60), m = mins % 60;
  const label = [h ? plural(h, 'hour') : '', m ? plural(m, 'minute') : ''].filter(Boolean).join(' ');
  return { expired: false, urgent: true, label };
}
