/**
 * Business date and hour for providers that send UTC instants (Clover).
 *
 * lib/business-date.ts works on local wall-clock parts the POS already printed.
 * An API hands over an epoch, so the zone has to be applied here. Pure; uses
 * Intl, so DST is whatever the runtime's tz database says.
 */

type Parts = { y: number; m: number; d: number; h: number; min: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try { fmt(tz); return true; } catch { return false; }
}

function partsOf(ms: number, tz: string): Parts {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD plus n days, calendar arithmetic with no zone involved. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function localHour(ms: number, tz: string): number {
  return partsOf(ms, tz).h;
}

/** A local time before the cutoff belongs to the previous calendar day. */
export function businessDateOf(ms: number, tz: string, cutoffHour: number): string {
  const { y, m, d, h } = partsOf(ms, tz);
  const date = `${y}-${pad(m)}-${pad(d)}`;
  return h < cutoffHour ? addDays(date, -1) : date;
}

/** The instant a local wall-clock time (date + whole hour) happens in the zone. */
export function zonedMs(date: string, hour: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hour);
  const offsetAt = (ms: number) => {
    const p = partsOf(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - (ms - (ms % 60000));
  };
  // Two passes settle the answer when the guess lands across a DST change.
  let ms = asUtc - offsetAt(asUtc);
  ms = asUtc - offsetAt(ms);
  return ms;
}
