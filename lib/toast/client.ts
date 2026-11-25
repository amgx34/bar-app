/**
 * Typed Toast REST reader. Read-only by construction: a GET and a few named
 * reads, nothing that writes.
 *
 * Written from Toast's documentation, not a live restaurant (spec s.11).
 *
 * - Every request carries `Toast-Restaurant-External-ID`.
 * - ordersBulk is paged with `page` (1-based) and `pageSize` (max 100). A page
 *   ends the list only when it is EMPTY: a short page is not trusted as the end
 *   because a server cap below pageSize would then truncate a night silently. A
 *   page that repeats the previous one means the server ignored `page`, which is
 *   an error rather than an endless loop.
 * - 429 and 5xx back off (Retry-After wins, else 1s doubling) and retry.
 * - A 401 asks for a fresh token once and retries once.
 * - Every request has a timeout and requests are spaced a little apart.
 * - Errors carry the status and a short non-secret hint, never the token.
 */

import type {
  ToastEmployee, ToastMenuItem, ToastMenusResponse, ToastMenuGroup,
  ToastOrder, ToastRestaurant, ToastTimeEntry,
} from './types';

/**
 * The host Toast issues with the API credentials. The production default is the
 * documented one; sandbox or a partner host comes from TOAST_API_HOST.
 */
export function toastHost(env: Record<string, string | undefined> = process.env): string {
  const raw = env.TOAST_API_HOST?.trim();
  if (!raw) return 'https://ws-api.toasttab.com';
  const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (u.protocol !== 'https:') throw new Error('TOAST_API_HOST must be an https host');
  return u.origin;
}

// ── Format helpers ────────────────────────────────────────────────────────────

/** YYYY-MM-DD → YYYYMMDD (Toast businessDate integer format) */
export function toToastDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** ISO date → Toast timestamp (e.g. "2026-06-01T00:00:00.000+0000") */
export function toToastTs(date: Date): string {
  return date.toISOString().replace('Z', '+0000');
}

/** YYYYMMDD integer → YYYY-MM-DD string, or null when it is not one. */
export function fromToastDate(d: unknown): string | null {
  const s = String(d ?? '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class ToastHttpError extends Error {
  constructor(readonly status: number, readonly path: string, detail: string) {
    super(`Toast ${status} on ${path}${detail ? `: ${detail}` : ''}`);
    this.name = 'ToastHttpError';
  }
}

export type ToastClientOptions = {
  host: string;
  restaurantGuid: string;
  /** `rejected` is the token the API just refused, so the caller does not log in twice. */
  getToken: (force?: { rejected: string }) => Promise<string>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  pageSize?: number;
  /** Safety valve on one paged read. Exceeding it is an error, not a truncation. */
  maxPages?: number;
};

type Params = Record<string, string | number | undefined>;

export function createToastClient(o: ToastClientOptions) {
  const fetchFn = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = o.timeoutMs ?? 20000;
  const maxRetries = o.maxRetries ?? 4;
  const pageSize = o.pageSize ?? 100;
  const maxPages = o.maxPages ?? 500;
  const MIN_GAP_MS = 60;
  let last = 0;
  let token: string | null = null;

  async function pace() {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  }

  function url(path: string, params: Params) {
    const u = new URL(`${o.host}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async function get<T>(path: string, params: Params = {}): Promise<T> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      token ??= await o.getToken();
      await pace();
      let res: Response;
      try {
        res = await fetchFn(url(path, params), {
          headers: {
            Authorization: `Bearer ${token}`,
            'Toast-Restaurant-External-ID': o.restaurantGuid,
            Accept: 'application/json',
            'User-Agent': 'Rail/1.0',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (attempt >= maxRetries) throw new ToastHttpError(0, path, e instanceof Error ? e.message : 'network error');
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.ok) return (await res.json()) as T;

      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await o.getToken({ rejected: token });
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new ToastHttpError(res.status, path, (await res.text().catch(() => '')).slice(0, 120));
    }
  }

  /** A bare-array endpoint. Anything else is an error: an empty list must mean "none". */
  async function getArray<T>(path: string, params: Params = {}): Promise<T[]> {
    const body = await get<unknown>(path, params);
    if (!Array.isArray(body)) throw new Error(`Toast ${path} returned an unexpected response`);
    return body as T[];
  }

  async function pagedOrders(params: Params): Promise<ToastOrder[]> {
    const out: ToastOrder[] = [];
    let prevFirst: string | undefined;
    for (let page = 1; ; page++) {
      if (page > maxPages) throw new Error(`Toast ordersBulk returned more than ${maxPages} pages; narrow the window`);
      const batch = await getArray<ToastOrder>('/orders/v2/ordersBulk', { ...params, pageSize, page });
      if (!batch.length) return out;
      if (batch[0]?.guid && batch[0].guid === prevFirst) throw new Error('Toast ordersBulk repeated a page, so paging is not working');
      prevFirst = batch[0]?.guid;
      out.push(...batch);
    }
  }

  return {
    /** Every order of one business date (yyyy-MM-dd). */
    ordersForDate: (isoDate: string) => pagedOrders({ businessDate: toToastDate(isoDate) }),
    /** Orders modified in the window: finds old orders that were refunded or edited since. */
    ordersModified: (start: Date, end: Date) => pagedOrders({ startDate: toToastTs(start), endDate: toToastTs(end) }),
    employees: () => getArray<ToastEmployee>('/labor/v1/employees'),
    timeEntries: (isoDate: string) => getArray<ToastTimeEntry>('/labor/v1/timeEntries', { businessDate: toToastDate(isoDate) }),
    restaurant: (guid: string) => get<ToastRestaurant>(`/restaurants/v1/restaurants/${encodeURIComponent(guid)}`),
    menus: () => get<ToastMenusResponse>('/menus/v2/menus'),
  };
}
export type ToastClient = ReturnType<typeof createToastClient>;

/** Every item in a menus response, with the nearest group name for items that carry no sales category. */
export function flattenMenuItems(res: ToastMenusResponse): (ToastMenuItem & { group: string })[] {
  const out: (ToastMenuItem & { group: string })[] = [];
  const walk = (g: ToastMenuGroup) => {
    for (const i of g.menuItems ?? []) out.push({ ...i, group: g.name?.trim() ?? '' });
    for (const s of g.menuGroups ?? []) walk(s);
  };
  for (const m of res.menus ?? []) for (const g of m.menuGroups ?? []) walk(g);
  return out;
}
