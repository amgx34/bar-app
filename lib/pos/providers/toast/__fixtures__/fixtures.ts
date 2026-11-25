/**
 * Hand-written to the response shapes in Toast's ordersBulk, labor and menus
 * documentation. NOT recorded from a live restaurant: field names, the dollars
 * unit and whether refundAmount excludes tax are open questions in
 * docs/superpowers/specs section 11. Replace with a sandbox recording when one
 * exists.
 *
 * Restaurant: America/New_York, closeout hour 4, November (EST, UTC-5).
 *   2026-11-21 business night: tickets 20:05 to 01:20 local; one paid after
 *     midnight, so its calendar date (the 22nd) differs from its business date
 *   2026-11-22: a gift card payment (unknown split) and a cash ticket
 *   2026-11-23: a card sale, an open tab, and a refund of an order from the 20th
 */
import type {
  ToastCheck, ToastEmployee, ToastMenusResponse, ToastOrder, ToastPayment, ToastSelection, ToastTimeEntry,
} from '@/lib/toast/types';

export const pay = (guid: string, type: string, amount: number, paidDate: string, extra: Partial<ToastPayment> = {}): ToastPayment =>
  ({ guid, type, amount, tipAmount: 0, paymentStatus: 'CAPTURED', paidDate, ...extra });

export const sel = (guid: string, displayName: string, price: number, item: string, extra: Partial<ToastSelection> = {}): ToastSelection =>
  ({ guid, displayName, price, quantity: 1, item: { guid: item }, ...extra });

export const chk = (guid: string, amount: number, payments: ToastPayment[], selections: ToastSelection[] = [], extra: Partial<ToastCheck> = {}): ToastCheck =>
  ({ guid, amount, paymentStatus: 'CLOSED', payments, selections, ...extra });

export const ord = (guid: string, businessDate: number, server: string | null, checks: ToastCheck[], extra: Partial<ToastOrder> = {}): ToastOrder =>
  ({ guid, businessDate, server: server ? { guid: server } : null, checks, ...extra });

export const employees: ToastEmployee[] = [
  { guid: 'E1', firstName: 'Alice', lastName: 'Reyes' },
  { guid: 'E2', firstName: 'Robert', lastName: 'Chen', chosenName: 'Bob' },
  { guid: 'E3', firstName: 'Carol', lastName: 'Ng' },
  { guid: 'E4', firstName: 'Dan', lastName: 'Old', deleted: true },
];

export const menus: ToastMenusResponse = {
  menus: [{ guid: 'M', name: 'Main', menuGroups: [
    { guid: 'G-beer', name: 'Draft Beer', menuItems: [{ guid: 'i-bud', name: 'Bud Light', salesCategory: { guid: 'sc-beer', name: 'Beer' } }] },
    { guid: 'G-food', name: 'Kitchen', menuItems: [{ guid: 'i-wings', name: 'Wings' }], menuGroups: [
      { guid: 'G-sides', name: 'Sides', menuItems: [{ guid: 'i-fries', name: 'Fries' }] },
    ] },
    { guid: 'G-cock', name: 'Cocktails', menuItems: [{ guid: 'i-marg', name: 'Margarita', salesCategory: { guid: 'sc-cock', name: 'Cocktails' } }] },
  ] }],
};

const Z1 = '2026-11-22T01:05:00Z';   // 20:05 local on the 21st
const Z2 = '2026-11-22T03:00:00Z';   // 22:00 local
const Z3 = '2026-11-22T03:05:00Z';   // 22:05 local
const AFTER_MIDNIGHT = '2026-11-22T06:20:00Z'; // 01:20 local on the 22nd, still the 21st's business day

export const orders: ToastOrder[] = [
  // One card payment with tip: net 15.00, tax 1.20, tip 3.00.
  ord('O1', 20261121, 'E1', [
    chk('C1', 15.0, [pay('P1', 'CREDIT', 16.2, Z1, { tipAmount: 3 })], [
      sel('S1', 'Bud Light', 6, 'i-bud'), sel('S2', 'Margarita', 9, 'i-marg'),
    ]),
  ]),
  // One check, two payments: net 20.00 split half cash, half card.
  ord('O2', 20261121, 'E2', [
    chk('C2', 20.0, [pay('P2', 'CASH', 10.8, Z3), pay('P3', 'CREDIT', 10.8, Z2, { tipAmount: 2 })], [
      sel('S3', 'Wings', 14, 'i-wings'), sel('S4', 'Fries', 6, 'i-fries'),
    ]),
  ]),
  // Paid 01:20 on the 22nd by the calendar, but Toast files it under the 21st.
  ord('O3', 20261121, 'E1', [
    chk('C3', 6.0, [pay('P4', 'CASH', 6.48, AFTER_MIDNIGHT)], [sel('S5', 'Bud Light', 6, 'i-bud')]),
  ]),
  // A voided order, a deleted order and a test-mode order. None of it was sold.
  ord('O4', 20261121, 'E1', [chk('C4', 50, [pay('P5', 'CREDIT', 54, Z1)], [sel('S6', 'Margarita', 50, 'i-marg')])], { voided: true }),
  ord('O5', 20261121, 'E1', [chk('C5', 40, [pay('P6', 'CREDIT', 43.2, Z1)], [sel('S7', 'Margarita', 40, 'i-marg')])], { deleted: true }),
  ord('O6', 20261121, 'E1', [chk('C6', 30, [pay('P7', 'CREDIT', 32.4, Z1)], [sel('S8', 'Margarita', 30, 'i-marg')])], { createdInTestMode: true }),
  // One voided check beside a good one on the same order.
  ord('O7', 20261121, 'E2', [
    chk('C7', 30, [pay('P8', 'CREDIT', 32.4, Z2)], [sel('S9', 'Wings', 30, 'i-wings')], { voided: true }),
    chk('C8', 10, [pay('P9', 'CASH', 10.8, '2026-11-22T03:30:00Z')], [sel('S10', 'Wings', 10, 'i-wings')]),
  ]),
  // A voided selection: the shot was rung and then voided, and the check amount already excludes it.
  ord('O8', 20261121, 'E3', [
    chk('C9', 12, [pay('P10', 'CREDIT', 12.96, '2026-11-22T02:00:00Z', { tipAmount: 2.4 })], [
      sel('S11', 'Margarita', 12, 'i-marg'), sel('S12', 'Shot', 5, 'i-marg', { voided: true }),
    ]),
  ]),
  // 22nd: a gift card payment, so the cash/card split cannot be claimed.
  ord('O9', 20261122, 'E1', [chk('C10', 8, [pay('P11', 'GIFTCARD', 8.64, '2026-11-23T02:00:00Z')], [sel('S13', 'Wings', 8, 'i-wings')])]),
  ord('O10', 20261122, 'E2', [chk('C11', 16, [pay('P12', 'CASH', 17.28, '2026-11-23T03:00:00Z')], [sel('S14', 'Margarita', 16, 'i-marg')])]),
  // 23rd: a card sale, plus an open tab that has not been paid.
  ord('O11', 20261123, 'E3', [chk('C12', 28.5, [pay('P13', 'CREDIT', 30.78, '2026-11-24T01:00:00Z', { tipAmount: 4 })], [
    sel('S15', 'Margarita', 28.5, 'i-marg', { quantity: 2 }),
  ])]),
  ord('O12', 20261123, 'E3', [chk('C13', 20, [], [sel('S16', 'Wings', 20, 'i-wings')], { paymentStatus: 'OPEN' })]),
  // An order from before the window, refunded on the 23rd: the modified-window pull brings it in.
  ord('O0', 20261120, 'E1', [chk('C0', 10, [pay('P0', 'CREDIT', 10.8, '2026-11-21T02:00:00Z', {
    tipAmount: 2,
    refund: { refundAmount: 10, taxRefundAmount: 0.8, tipRefundAmount: 2, refundBusinessDate: 20261123 },
  })], [sel('S0', 'Margarita', 10, 'i-marg')])]),
];

export const timeEntries: Record<string, ToastTimeEntry[]> = {
  '2026-11-21': [
    { guid: 'T1', employeeReference: { guid: 'E1' }, inDate: '2026-11-21T20:00:00Z', outDate: '2026-11-22T06:00:00Z', businessDate: 20261121, regularHours: 8, overtimeHours: 2, declaredCashTips: 15.5 },
    { guid: 'T2', employeeReference: { guid: 'E2' }, inDate: '2026-11-21T22:00:00Z', outDate: '2026-11-22T04:00:00Z', businessDate: 20261121, regularHours: 6, overtimeHours: 0, declaredCashTips: 4.25 },
    // Still clocked in: hours are not final.
    { guid: 'T3', employeeReference: { guid: 'E3' }, inDate: '2026-11-21T23:00:00Z', businessDate: 20261121, regularHours: 0, overtimeHours: 0, declaredCashTips: 0 },
    { guid: 'T4', employeeReference: { guid: 'E3' }, inDate: '2026-11-21T10:00:00Z', outDate: '2026-11-21T12:00:00Z', businessDate: 20261121, regularHours: 2, overtimeHours: 0, declaredCashTips: 99, deleted: true },
  ],
  '2026-11-22': [],
  '2026-11-23': [
    { guid: 'T5', employeeReference: { guid: 'E2' }, inDate: '2026-11-23T22:00:00Z', outDate: '2026-11-24T03:00:00Z', businessDate: 20261123, regularHours: 5, overtimeHours: 0, declaredCashTips: 0 },
  ],
};
