/**
 * Clover REST records -> the nightly rows Rail stores. Pure: no network, no
 * clock, no database, so every rule below is pinned by map.test.ts.
 *
 * Attribution (docs/superpowers/specs/2026-11-25-clover-toast-integration.md,
 * section 6): a sale belongs to the business date it was PAID, a refund to the
 * date it HAPPENED. Clover has no business day of its own, so the date is the
 * payment instant in the merchant zone, rolled back before the cutoff hour.
 *
 * Money is integer cents all the way through; dollars appear only in the
 * output rows, once, via centsToDollars.
 *
 * UNVERIFIED against a live merchant (spec section 11): that payment.amount
 * includes taxAmount and excludes tip, the thousandths unit of unitQty, and
 * the line-item field names (`deleted`, `refunded`, `discounts`).
 */

import { businessDateOf, localHour } from '@/lib/pos/business-date';
import { centsToDollars } from '@/lib/pos/money';
import type {
  EWReportRow, HourlySalesPayloadRow, ItemAuditRow, ServerSalesPayloadRow, ZReportRow,
} from '@/lib/pos/normalized';

export type CloverEmployee = { id: string; name?: string };
export type CloverRef = { id: string };
export type CloverPayment = {
  id: string;
  order?: CloverRef;
  tender?: { labelKey?: string; label?: string };
  amount?: number;
  tipAmount?: number;
  taxAmount?: number;
  createdTime: number;
  result?: string;
  employee?: CloverRef;
};
export type CloverRefund = {
  id: string;
  payment?: CloverRef;
  amount?: number;
  taxAmount?: number;
  tipAmount?: number;
  createdTime: number;
};
export type CloverLineItem = {
  id: string;
  name?: string;
  /** Cents, per unit. */
  price?: number;
  /** Thousandths of a unit; absent means one. */
  unitQty?: number | null;
  item?: CloverRef;
  deleted?: boolean;
  refunded?: boolean;
  discounts?: { elements?: { amount?: number; percentage?: number }[] };
};
export type CloverOrder = {
  id: string;
  createdTime: number;
  testMode?: boolean;
  deleted?: boolean;
  lineItems?: { elements?: CloverLineItem[] };
};
export type CloverShift = {
  id: string;
  employee?: CloverRef & { name?: string };
  inTime?: number;
  outTime?: number;
  overrideInTime?: number;
  overrideOutTime?: number;
};

export type MapInput = {
  tz: string;
  cutoffHour: number;
  /** Business dates, inclusive. Rows outside them are dropped. */
  from: string;
  to: string;
  payments: CloverPayment[];
  /** Payments fetched by id because a refund pointed at one outside the window. */
  extraPayments?: CloverPayment[];
  refunds: CloverRefund[];
  /** null: the feed was not fetched. Items are then undefined, never empty. */
  orders: CloverOrder[] | null;
  /** Clover item id -> category name. */
  catalog?: Map<string, string>;
  employees: CloverEmployee[] | null;
  shifts: CloverShift[] | null;
};

export type MapResult = {
  zReports: ZReportRow[];
  hourlySales: HourlySalesPayloadRow[];
  serverSales?: ServerSalesPayloadRow[];
  itemAudit?: ItemAuditRow[];
  ewReports?: EWReportRow[];
  errors: string[];
};

const CASH = 'com.clover.tender.cash';
const CARD = new Set(['com.clover.tender.credit_card', 'com.clover.tender.debit_card']);

type Tender = 'cash' | 'card' | 'other';
const tenderOf = (p: CloverPayment | undefined): Tender | null => {
  const k = p?.tender?.labelKey;
  if (!p) return null;
  return k === CASH ? 'cash' : k && CARD.has(k) ? 'card' : 'other';
};
const int = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0);

type Night = { net: number; cash: number; card: number; tips: number; unknownTender: boolean; touched: boolean };

export function mapClover(input: MapInput): MapResult {
  const { tz, cutoffHour: cut, from, to } = input;
  const errors: string[] = [];
  const dateOf = (t: number) => businessDateOf(t, tz, cut);
  const inWindow = (d: string) => d >= from && d <= to;

  const testOrders = new Set((input.orders ?? []).filter((o) => o.testMode).map((o) => o.id));
  const isLive = (p: CloverPayment) => p.result === 'SUCCESS' && !(p.order && testOrders.has(p.order.id));

  const allPayments = new Map<string, CloverPayment>();
  for (const p of [...input.payments, ...(input.extraPayments ?? [])]) allPayments.set(p.id, p);
  const live = input.payments.filter(isLive);
  // A card tip is a tip on any tender that is not cash.
  const tipOf = (p: CloverPayment) => (tenderOf(p) === 'cash' ? 0 : int(p.tipAmount));
  const netOf = (p: CloverPayment) => int(p.amount) - int(p.taxAmount);

  // ── Z ─────────────────────────────────────────────────────────────────────
  const nights = new Map<string, Night>();
  const night = (d: string) => {
    let n = nights.get(d);
    if (!n) nights.set(d, (n = { net: 0, cash: 0, card: 0, tips: 0, unknownTender: false, touched: true }));
    return n;
  };
  const bucket = (n: Night, t: Tender | null, cents: number) => {
    if (t === 'cash') n.cash += cents;
    else if (t === 'card') n.card += cents;
    else n.unknownTender = true;
  };

  for (const p of live) {
    const n = night(dateOf(p.createdTime));
    const net = netOf(p);
    n.net += net;
    n.tips += tipOf(p);
    bucket(n, tenderOf(p), net);
  }
  for (const r of input.refunds) {
    const p = r.payment ? allPayments.get(r.payment.id) : undefined;
    if (p && !isLive(p)) continue; // a refund of a payment that never counted
    const n = night(dateOf(r.createdTime));
    const net = int(r.amount) - int(r.taxAmount) - int(r.tipAmount);
    n.net -= net;
    if (p && tenderOf(p) !== 'cash') n.tips -= int(r.tipAmount);
    bucket(n, tenderOf(p), -net);
  }

  const zReports: ZReportRow[] = [];
  for (const [d, n] of [...nights].sort(([a], [b]) => a.localeCompare(b))) {
    if (!inWindow(d)) continue;
    if (n.net < 0 || n.tips < 0) {
      // Rail stores non-negative nights. Saying so beats a silent drop.
      errors.push(`${d}: refunds exceed sales (negative night), not stored. The sales are in an earlier window.`);
      continue;
    }
    const row: ZReportRow = { report_date: d, total_sales: centsToDollars(n.net), cc_tips: centsToDollars(n.tips) };
    // NULL means "not reported". Only claim a split that adds up to the total.
    if (!n.unknownTender && n.cash + n.card === n.net) {
      row.cash_sales = centsToDollars(n.cash);
      row.card_sales = centsToDollars(n.card);
    }
    zReports.push(row);
  }

  // ── Hourly ────────────────────────────────────────────────────────────────
  const hours = new Map<string, { date: string; hour: number; net: number; tips: number; orders: Set<string> }>();
  for (const p of live) {
    const date = dateOf(p.createdTime);
    if (!inWindow(date)) continue;
    const hour = localHour(p.createdTime, tz);
    const k = `${date}|${hour}`;
    const h = hours.get(k) ?? { date, hour, net: 0, tips: 0, orders: new Set<string>() };
    h.net += netOf(p); h.tips += tipOf(p); h.orders.add(p.order?.id ?? p.id);
    hours.set(k, h);
  }
  const hourlySales: HourlySalesPayloadRow[] = [...hours.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
    .map((h) => ({ business_date: h.date, hour: h.hour, net_sales: centsToDollars(h.net), ticket_count: h.orders.size, tips: centsToDollars(h.tips) }));

  // ── Servers ───────────────────────────────────────────────────────────────
  const nameById = new Map((input.employees ?? []).map((e) => [e.id, e.name?.trim() ?? '']));
  let serverSales: ServerSalesPayloadRow[] | undefined;
  const serverNet = new Map<string, number>(); // date|lower name -> cents, for the shift rows
  if (input.employees) {
    const by = new Map<string, { date: string; name: string; net: number; tips: number; orders: Set<string> }>();
    for (const p of live) {
      const date = dateOf(p.createdTime);
      const name = p.employee ? nameById.get(p.employee.id) : undefined;
      if (!inWindow(date) || !name) continue;
      const k = `${date}|${name.toLowerCase()}`;
      const s = by.get(k) ?? { date, name, net: 0, tips: 0, orders: new Set<string>() };
      s.net += netOf(p); s.tips += tipOf(p); s.orders.add(p.order?.id ?? p.id);
      by.set(k, s);
      serverNet.set(k, s.net);
    }
    serverSales = [...by.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .map((s) => ({ business_date: s.date, server_name: s.name, net_sales: centsToDollars(s.net), ticket_count: s.orders.size, tips: centsToDollars(s.tips) }));
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  let itemAudit: ItemAuditRow[] | undefined;
  if (input.orders) {
    const paymentsByOrder = new Map<string, CloverPayment[]>();
    for (const p of live) if (p.order) paymentsByOrder.set(p.order.id, [...(paymentsByOrder.get(p.order.id) ?? []), p]);
    const refundsByOrder = new Map<string, number[]>();
    for (const r of input.refunds) {
      const orderId = r.payment ? allPayments.get(r.payment.id)?.order?.id : undefined;
      if (orderId) refundsByOrder.set(orderId, [...(refundsByOrder.get(orderId) ?? []), r.createdTime]);
    }

    const seen = new Set(input.orders.map((o) => o.id));
    const missing = [...paymentsByOrder.keys()].filter((id) => !seen.has(id)
      && inWindow(dateOf(Math.min(...paymentsByOrder.get(id)!.map((p) => p.createdTime)))));
    if (missing.length) errors.push(`${missing.length} paid order(s) were not returned by the orders feed; their items were skipped.`);

    const rows = new Map<string, { date: string; name: string; cat: string; qty: number; net: number }>();
    const add = (date: string, name: string, cat: string, qty: number, net: number) => {
      if (!inWindow(date)) return;
      const k = `${date}|${name}|${cat}`;
      const r = rows.get(k) ?? { date, name, cat, qty: 0, net: 0 };
      r.qty += qty; r.net += net;
      rows.set(k, r);
    };

    for (const o of input.orders) {
      if (o.testMode || o.deleted) continue;
      const pays = paymentsByOrder.get(o.id);
      if (!pays?.length) continue; // nothing was paid, so nothing was sold
      const saleDate = dateOf(Math.min(...pays.map((p) => p.createdTime)));
      const refundTimes = refundsByOrder.get(o.id);
      const refundDate = refundTimes?.length ? dateOf(Math.min(...refundTimes)) : saleDate;

      for (const l of o.lineItems?.elements ?? []) {
        const name = l.name?.trim();
        if (l.deleted || !name) continue;
        const qty = l.unitQty == null ? 1 : l.unitQty / 1000;
        const gross = Math.round(int(l.price) * qty);
        let off = 0;
        for (const d of l.discounts?.elements ?? []) {
          off += d.amount != null ? Math.abs(int(d.amount)) : Math.round((gross * int(d.percentage)) / 100);
        }
        const net = gross - off;
        const cat = (l.item && input.catalog?.get(l.item.id)) || '';
        add(saleDate, name, cat, qty, net);
        if (l.refunded) add(refundDate, name, cat, -qty, -net);
      }
    }
    itemAudit = [...rows.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .map((r) => ({ sale_date: r.date, item_name: r.name, category_name: r.cat, qty_sold: Math.round(r.qty * 10000) / 10000, net_sales: centsToDollars(r.net) }));
  }

  // ── Shifts ────────────────────────────────────────────────────────────────
  let ewReports: EWReportRow[] | undefined;
  if (input.shifts) {
    const by = new Map<string, EWReportRow & { ms: number }>();
    for (const s of input.shifts) {
      const inT = s.overrideInTime ?? s.inTime;
      const outT = s.overrideOutTime ?? s.outTime;
      if (!inT || !outT || outT <= inT) continue; // open or nonsense
      const name = (s.employee?.id ? nameById.get(s.employee.id) : undefined) || s.employee?.name?.trim();
      if (!name) continue;
      const date = dateOf(inT);
      if (!inWindow(date)) continue;
      const k = `${date}|${name.toLowerCase()}`;
      const prev = by.get(k);
      const ms = (prev?.ms ?? 0) + (outT - inT);
      by.set(k, {
        shift_date: date, employee_name: name, total_sales: centsToDollars(serverNet.get(k) ?? 0),
        tips_paid_out: 0, regular_hours: Math.round((ms / 3600000) * 100) / 100,
        // Clover has no overtime rule; payroll applies Rail's.
        overtime_hours: 0, ms,
      });
    }
    ewReports = [...by.values()]
      .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.employee_name.localeCompare(b.employee_name))
      .map(({ ms: _ms, ...row }) => (void _ms, row));
  }

  return { zReports, hourlySales, serverSales, itemAudit, ewReports, errors };
}
