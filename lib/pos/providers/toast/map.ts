/**
 * Toast orders and labor -> the nightly rows Rail stores. Pure: no network, no
 * clock, no database, so every rule below is pinned by map.test.ts.
 *
 * Attribution (spec s.6): Toast already assigns a business date to every order,
 * and it is used as given, never re-derived from a timestamp. A sale belongs to
 * its order's business date; a refund belongs to the business date it happened
 * (`refund.refundBusinessDate`), so a late refund reduces a later night instead
 * of rewriting an old one. The time zone is used only for the hour of day of
 * hourly rows.
 *
 * Money is integer cents all the way through and becomes dollars once, at the
 * output. Toast documents decimal dollars; if a sandbox shows cents, set
 * TOAST_AMOUNTS_IN_CENTS=true rather than editing this file.
 *
 * What counts as sold: not a voided, deleted or test-mode order; not a voided or
 * deleted check; and only checks Toast marks PAID or CLOSED. An open tab is not
 * revenue yet, and the 3-night lookback picks it up once it is paid.
 *
 * UNVERIFIED against a live restaurant (spec s.11): that check.amount excludes
 * tax and tip, that refundAmount excludes tax, that selection.price is the
 * whole line (quantity included), and the `gratuity` flag on service charges.
 */

import { localHour } from '@/lib/pos/business-date';
import { centsToDollars, toCents } from '@/lib/pos/money';
import type {
  EWReportRow, HourlySalesPayloadRow, ItemAuditRow, ServerSalesPayloadRow, ZReportRow,
} from '@/lib/pos/normalized';
import { flattenMenuItems, fromToastDate } from '@/lib/toast/client';
import type {
  ToastCheck, ToastEmployee, ToastMenusResponse, ToastOrder, ToastPayment, ToastTimeEntry,
} from '@/lib/toast/types';

export type MapInput = {
  /** The restaurant's zone. Used only for the hour of day. */
  tz: string;
  /** Business dates, inclusive. Rows outside them are dropped. */
  from: string;
  to: string;
  /** Orders for the window, plus older orders modified since (they may carry a refund). */
  orders: ToastOrder[];
  /** null: not fetched. Servers and shifts are then undefined, never empty. */
  employees: ToastEmployee[] | null;
  /** Business date (YYYY-MM-DD) -> entries. null: the labor feed was not fetched. */
  timeEntries: Record<string, ToastTimeEntry[]> | null;
  /** null: the menus feed failed; items still map, with no category. */
  menu: ToastMenusResponse | null;
  includeItems: boolean;
  /** Set when a sandbox shows Toast sends cents, not the documented dollars. */
  amountsInCents?: boolean;
};

export type MapResult = {
  zReports: ZReportRow[];
  hourlySales: HourlySalesPayloadRow[];
  serverSales?: ServerSalesPayloadRow[];
  itemAudit?: ItemAuditRow[];
  ewReports?: EWReportRow[];
  errors: string[];
};

type Tender = 'cash' | 'card' | 'other';
const tenderOf = (p: ToastPayment): Tender => (p.type === 'CASH' ? 'cash' : p.type === 'CREDIT' ? 'card' : 'other');

const isLiveOrder = (o: ToastOrder) => !o.voided && !o.deleted && !o.createdInTestMode;
const isSoldCheck = (c: ToastCheck) =>
  !c.voided && !c.deleted && (c.paymentStatus === 'PAID' || c.paymentStatus === 'CLOSED');
const countsAsPayment = (p: ToastPayment) =>
  p.paymentStatus !== 'VOIDED' && p.paymentStatus !== 'DENIED' && !p.voidInfo;

/** Toast writes "+0000", which not every parser accepts. */
const ms = (iso: string | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return Number.isNaN(t) ? null : t;
};

/** Splits `total` across `weights` so the parts add back to it exactly. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  let cum = 0, given = 0;
  return weights.map((w) => {
    cum += w;
    const upTo = Math.round((total * cum) / sum);
    const part = upTo - given;
    given = upTo;
    return part;
  });
}

const nameOf = (e: ToastEmployee) => e.chosenName?.trim() || `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim();

type Night = { net: number; cash: number; card: number; tips: number; unknownTender: boolean };
type Sale = { date: string; ms: number | null; net: number; tips: number; check: string; server: string | undefined };

export function mapToast(input: MapInput): MapResult {
  const { tz, from, to } = input;
  const errors: string[] = [];
  const c = (n: unknown) => (input.amountsInCents ? (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0) : toCents(n));
  const inWindow = (d: string) => d >= from && d <= to;

  const nights = new Map<string, Night>();
  const night = (d: string) => {
    let n = nights.get(d);
    if (!n) nights.set(d, (n = { net: 0, cash: 0, card: 0, tips: 0, unknownTender: false }));
    return n;
  };
  const bucket = (n: Night, t: Tender, cents: number) => {
    if (t === 'cash') n.cash += cents; else if (t === 'card') n.card += cents; else n.unknownTender = true;
  };

  const sales: Sale[] = [];
  const liveOrders: { order: ToastOrder; date: string; checks: ToastCheck[] }[] = [];
  let undated = 0;

  for (const o of input.orders) {
    if (!isLiveOrder(o)) continue;
    const date = fromToastDate(o.businessDate);
    if (!date) { undated++; continue; }
    const checks = (o.checks ?? []).filter(isSoldCheck);
    liveOrders.push({ order: o, date, checks });

    for (const ch of checks) {
      const gratuity = (ch.appliedServiceCharges ?? []).reduce((s, x) => s + (x.gratuity ? c(x.chargeAmount) : 0), 0);
      const netTotal = c(ch.amount) - gratuity;
      const pays = (ch.payments ?? []).filter(countsAsPayment);
      const weights = pays.map((p) => Math.max(0, c(p.amount)));
      const n = night(date);
      n.tips += gratuity;

      if (!pays.length || weights.every((w) => w === 0)) {
        // Nothing to say which tender paid, so the night cannot claim a split.
        n.net += netTotal;
        n.unknownTender = true;
        continue;
      }
      const nets = split(netTotal, weights);
      const grats = split(gratuity, weights);
      pays.forEach((p, i) => {
        const t = tenderOf(p);
        const tip = t === 'cash' ? 0 : c(p.tipAmount);
        n.net += nets[i];
        n.tips += tip;
        bucket(n, t, nets[i]);
        sales.push({ date, ms: ms(p.paidDate ?? ch.closedDate), net: nets[i], tips: tip + grats[i], check: ch.guid, server: o.server?.guid });
      });
    }

    // Refunds belong to the day they happened. Needs the payment to know the tender.
    for (const ch of checks) {
      for (const p of (ch.payments ?? []).filter(countsAsPayment)) {
        if (!p.refund || typeof p.refund.refundAmount !== 'number') continue;
        const d = fromToastDate(p.refund.refundBusinessDate) ?? date;
        const n = night(d);
        const t = tenderOf(p);
        const net = c(p.refund.refundAmount);
        n.net -= net;
        if (t !== 'cash') n.tips -= c(p.refund.tipRefundAmount);
        bucket(n, t, -net);
      }
    }
  }
  if (undated) errors.push(`${undated} order(s) had no business date and were skipped.`);

  // ── Z ─────────────────────────────────────────────────────────────────────
  const cashTipsOf = new Map<string, number>();
  for (const [d, entries] of Object.entries(input.timeEntries ?? {})) {
    const live = entries.filter((e) => !e.deleted);
    if (live.length) cashTipsOf.set(d, live.reduce((s, e) => s + c(e.declaredCashTips), 0));
  }

  const zReports: ZReportRow[] = [];
  for (const [d, n] of [...nights].sort(([a], [b]) => a.localeCompare(b))) {
    if (!inWindow(d)) continue;
    if (n.net < 0 || n.tips < 0) {
      errors.push(`${d}: refunds exceed sales (negative night), not stored. The sales are in an earlier window.`);
      continue;
    }
    const row: ZReportRow = { report_date: d, total_sales: centsToDollars(n.net), cc_tips: centsToDollars(n.tips) };
    // Absent means "the POS did not report it": the stored figure is left alone.
    if (cashTipsOf.has(d)) row.cash_tips = centsToDollars(cashTipsOf.get(d)!);
    // NULL means "not reported". Only claim a split that adds up to the total.
    if (!n.unknownTender && n.cash + n.card === n.net) {
      row.cash_sales = centsToDollars(n.cash);
      row.card_sales = centsToDollars(n.card);
    }
    zReports.push(row);
  }

  // ── Hourly ────────────────────────────────────────────────────────────────
  const hours = new Map<string, { date: string; hour: number; net: number; tips: number; checks: Set<string> }>();
  for (const s of sales) {
    if (!inWindow(s.date) || s.ms == null) continue;
    const hour = localHour(s.ms, tz);
    const k = `${s.date}|${hour}`;
    const h = hours.get(k) ?? { date: s.date, hour, net: 0, tips: 0, checks: new Set<string>() };
    h.net += s.net; h.tips += s.tips; h.checks.add(s.check);
    hours.set(k, h);
  }
  const hourlySales: HourlySalesPayloadRow[] = [...hours.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
    .map((h) => ({ business_date: h.date, hour: h.hour, net_sales: centsToDollars(h.net), ticket_count: h.checks.size, tips: centsToDollars(h.tips) }));

  // ── Servers ───────────────────────────────────────────────────────────────
  // A deleted employee with trade in range is still named.
  const nameByGuid = new Map((input.employees ?? []).map((e) => [e.guid, nameOf(e)]));
  let serverSales: ServerSalesPayloadRow[] | undefined;
  const serverNet = new Map<string, number>();
  if (input.employees) {
    const by = new Map<string, { date: string; name: string; net: number; tips: number; checks: Set<string> }>();
    for (const s of sales) {
      const name = s.server ? nameByGuid.get(s.server) : undefined;
      if (!inWindow(s.date) || !name) continue;
      const k = `${s.date}|${name.toLowerCase()}`;
      const r = by.get(k) ?? { date: s.date, name, net: 0, tips: 0, checks: new Set<string>() };
      r.net += s.net; r.tips += s.tips; r.checks.add(s.check);
      by.set(k, r);
      serverNet.set(k, r.net);
    }
    serverSales = [...by.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .map((r) => ({ business_date: r.date, server_name: r.name, net_sales: centsToDollars(r.net), ticket_count: r.checks.size, tips: centsToDollars(r.tips) }));
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  let itemAudit: ItemAuditRow[] | undefined;
  if (input.includeItems) {
    const menuBy = new Map<string, { name: string; category: string }>();
    for (const i of input.menu ? flattenMenuItems(input.menu) : []) {
      menuBy.set(i.guid, { name: i.name?.trim() ?? '', category: i.salesCategory?.name?.trim() || i.group });
    }
    const rows = new Map<string, { date: string; name: string; cat: string; qty: number; net: number }>();
    for (const { date, checks } of liveOrders) {
      if (!inWindow(date)) continue;
      for (const ch of checks) {
        for (const s of ch.selections ?? []) {
          if (s.voided) continue; // modifiers live inside the selection and are not sold on their own
          const m = s.item ? menuBy.get(s.item.guid) : undefined;
          const name = s.displayName?.trim() || m?.name;
          const qty = s.quantity ?? 1;
          if (!name || !Number.isFinite(qty) || qty === 0) continue;
          const cat = m?.category ?? '';
          const k = `${date}|${name}|${cat}`;
          const r = rows.get(k) ?? { date, name, cat, qty: 0, net: 0 };
          r.qty += qty; r.net += c(s.price);
          rows.set(k, r);
        }
      }
    }
    itemAudit = [...rows.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .map((r) => ({ sale_date: r.date, item_name: r.name, category_name: r.cat, qty_sold: Math.round(r.qty * 10000) / 10000, net_sales: centsToDollars(r.net) }));
  }

  // ── Shifts ────────────────────────────────────────────────────────────────
  let ewReports: EWReportRow[] | undefined;
  if (input.timeEntries) {
    const by = new Map<string, { date: string; name: string; hours: number }>();
    for (const [d, entries] of Object.entries(input.timeEntries)) {
      if (!inWindow(d)) continue;
      for (const e of entries) {
        const name = e.employeeReference ? nameByGuid.get(e.employeeReference.guid) : undefined;
        // Hours are zero until clock-out, so an open entry says nothing yet.
        if (e.deleted || !e.outDate || !name) continue;
        // Overtime is booked as plain hours: Rail's pay run applies the weekly rule
        // once, and Toast's own split would be paid twice. Same as Clover and the old Toast sync.
        const h = (e.regularHours ?? 0) + (e.overtimeHours ?? 0);
        if (!(h > 0)) continue;
        const k = `${d}|${name.toLowerCase()}`;
        const r = by.get(k) ?? { date: d, name, hours: 0 };
        r.hours += h;
        by.set(k, r);
      }
    }
    ewReports = [...by.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .map((r) => ({
        shift_date: r.date, employee_name: r.name,
        total_sales: centsToDollars(serverNet.get(`${r.date}|${r.name.toLowerCase()}`) ?? 0),
        tips_paid_out: 0, regular_hours: Math.round(r.hours * 100) / 100, overtime_hours: 0,
      }));
  }

  return { zReports, hourlySales, serverSales, itemAudit, ewReports, errors };
}
