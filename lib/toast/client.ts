/**
 * Toast POS API client.
 *
 * Authentication: client-credentials (POST /authentication/v1/authentication/login).
 * Every request requires:
 *   Authorization: Bearer {accessToken}
 *   Toast-Restaurant-External-ID: {restaurantGuid}
 *
 * Amounts in the API are in **cents**. Divide by 100 for dollars.
 */

import type {
  ToastAuthResponse,
  ToastOrderBulkResponse,
  ToastOrder,
  ToastEmployee,
  ToastShift,
  ToastJob,
  ToastMenuGroup,
  ToastMenuItem,
} from './types';

// ── Base URLs ─────────────────────────────────────────────────────────────────

export const TOAST_BASE =
  process.env.TOAST_SANDBOX === 'true'
    ? 'https://ws-sandbox.toasttab.com'
    : 'https://ws-api.toasttab.com';

// ── Format helpers ────────────────────────────────────────────────────────────

/** YYYY-MM-DD → YYYYMMDD (Toast businessDate integer format) */
export function toToastDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** ISO date → Toast timestamp (e.g. "2026-06-01T00:00:00.000+0000") */
export function toToastTs(date: Date): string {
  return date.toISOString().replace('Z', '+0000').replace(/\.\d{3}/, '.000');
}

/** YYYYMMDD integer → YYYY-MM-DD string */
export function fromToastDate(d: number): string {
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class ToastClient {
  private constructor(
    private readonly accessToken:     string,
    private readonly restaurantGuid:  string,
  ) {}

  /** Authenticate with client credentials and return a ready client. */
  static async authenticate(
    clientId:       string,
    clientSecret:   string,
    restaurantGuid: string,
  ): Promise<ToastClient> {
    const res = await fetch(`${TOAST_BASE}/authentication/v1/authentication/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        clientSecret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Toast authentication failed (${res.status}): ${body}`);
    }

    const data: ToastAuthResponse = await res.json();
    if (!data?.token?.accessToken) throw new Error('Toast returned no access token');

    return new ToastClient(data.token.accessToken, restaurantGuid);
  }

  // ── Internal fetch ──────────────────────────────────────────────────────────

  private async call<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${TOAST_BASE}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization':                `Bearer ${this.accessToken}`,
        'Toast-Restaurant-External-ID': this.restaurantGuid,
        'Content-Type':                 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Toast API ${path} failed (${res.status}): ${body}`);
    }
    return res.json() as T;
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  /** Fetch all orders for a business date (YYYYMMDD string, e.g. "20260601"). */
  async getOrdersByBusinessDate(businessDate: string): Promise<ToastOrder[]> {
    const all: ToastOrder[] = [];
    let pageToken: string | undefined;

    do {
      const params: Record<string, string> = { businessDate };
      if (pageToken) params.pageToken = pageToken;

      const page = await this.call<ToastOrderBulkResponse>('/orders/v2/ordersBulk', params);
      all.push(...(page.orders ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    return all;
  }

  // ── Labor ───────────────────────────────────────────────────────────────────

  async getEmployees(): Promise<ToastEmployee[]> {
    const res = await this.call<ToastEmployee[]>('/labor/v1/employees');
    return Array.isArray(res) ? res : [];
  }

  async getJobs(): Promise<ToastJob[]> {
    const res = await this.call<ToastJob[]>('/labor/v1/jobs');
    return Array.isArray(res) ? res : [];
  }

  async getShiftsByBusinessDate(businessDate: string): Promise<ToastShift[]> {
    const res = await this.call<ToastShift[]>('/labor/v1/timeEntries', { businessDate });
    return Array.isArray(res) ? res : [];
  }

  // ── Menu / Inventory ────────────────────────────────────────────────────────

  async getMenuGroups(): Promise<ToastMenuGroup[]> {
    // menus endpoint returns the full menu tree
    const res = await this.call<{ groups?: ToastMenuGroup[] }>('/menu/v3/menus');
    return res.groups ?? [];
  }

  /** Flatten all menu groups into a single array of items. */
  async getAllMenuItems(): Promise<ToastMenuItem[]> {
    const groups = await this.getMenuGroups();
    return groups.flatMap((g) => g.items ?? []);
  }

  // ── Restaurant info ─────────────────────────────────────────────────────────

  async getRestaurantInfo(): Promise<{ guid: string; name: string }> {
    return this.call('/restaurants/v1/restaurants');
  }
}
