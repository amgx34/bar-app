/**
 * Hand-written to the response shapes in Clover's REST reference. NOT recorded
 * from a live merchant: field names, cent units and the amount/taxAmount
 * relationship are the open questions in docs/superpowers/specs section 11.
 * Replace with a sandbox recording when one exists.
 *
 * Venue is America/New_York, cutoff 04:00, in November (EST, UTC-5).
 *   Sat 2026-11-21 night: tickets from 20:15 to 00:20 local, one crossing midnight
 *   Sun 2026-11-22 night: one ticket whose burger is refunded on Monday
 *   Mon 2026-11-23 night: a sale, plus the Sunday burger refund
 */
import type {
  CloverEmployee, CloverLineItem, CloverOrder, CloverPayment, CloverRefund, CloverShift,
} from '../map';

export const ms = (iso: string) => Date.parse(iso);

const CASH = { labelKey: 'com.clover.tender.cash', label: 'Cash' };
const CARD = { labelKey: 'com.clover.tender.credit_card', label: 'Credit Card' };

export const employees: CloverEmployee[] = [
  { id: 'E1', name: 'Alice Reyes' },
  { id: 'E2', name: 'Bob Chen' },
  { id: 'E3', name: 'Carol Ng' },
];

export const catalog = new Map<string, string>([
  ['i-bud', 'Beer'], ['i-tito', 'Liquor'], ['i-marg', 'Cocktails'],
  ['i-wings', 'Food'], ['i-burger', 'Food'], ['i-old', 'Cocktails'],
]);

const li = (id: string, name: string, price: number, item: string, extra: Partial<CloverLineItem> = {}) =>
  ({ id, name, price, item: { id: item }, ...extra });

export const orders: CloverOrder[] = [
  { id: 'O1', createdTime: ms('2026-11-22T01:05:00Z'), lineItems: { elements: [
    li('L1', 'Bud Light', 600, 'i-bud'), li('L2', "Tito's & Soda", 900, 'i-tito'),
  ] } },
  { id: 'O2', createdTime: ms('2026-11-22T01:50:00Z'), lineItems: { elements: [
    li('L3', 'Margarita', 1200, 'i-marg'), li('L4', 'Margarita', 1200, 'i-marg'),
  ] } },
  // A voided line: Fries was rung and then deleted. Only Wings was sold.
  { id: 'O3', createdTime: ms('2026-11-22T02:55:00Z'), lineItems: { elements: [
    li('L5', 'Wings', 1400, 'i-wings'), li('L6', 'Fries', 700, 'i-wings', { deleted: true }),
  ] } },
  // Opened 23:50 local, paid 00:20 local: the same business night.
  { id: 'O4', createdTime: ms('2026-11-22T04:50:00Z'), lineItems: { elements: [
    li('L7', 'Bud Light', 600, 'i-bud'),
  ] } },
  { id: 'O5', createdTime: ms('2026-11-22T02:00:00Z'), testMode: true, lineItems: { elements: [
    li('L8', 'Bud Light', 600, 'i-bud'),
  ] } },
  // Only a voided payment: nothing was sold.
  { id: 'O6', createdTime: ms('2026-11-22T02:10:00Z'), lineItems: { elements: [
    li('L9', 'Wings', 1400, 'i-wings'),
  ] } },
  { id: 'O7', createdTime: ms('2026-11-22T23:50:00Z'), lineItems: { elements: [
    li('L10', 'Bud Light', 600, 'i-bud'), li('L11', 'Burger', 1800, 'i-burger', { refunded: true }),
  ] } },
  { id: 'O8', createdTime: ms('2026-11-24T00:45:00Z'), lineItems: { elements: [
    li('L12', 'Old Fashioned', 1500, 'i-old'),
    li('L13', 'Old Fashioned', 1500, 'i-old', { discounts: { elements: [{ percentage: 10 }] } }),
  ] } },
];

export const payments: CloverPayment[] = [
  { id: 'P1', order: { id: 'O1' }, tender: CARD, amount: 1620, taxAmount: 120, tipAmount: 300,
    createdTime: ms('2026-11-22T01:15:00Z'), result: 'SUCCESS', employee: { id: 'E1' } },
  // One order, two tenders: cash 1000 and card 1592 against 2400 net.
  { id: 'P2a', order: { id: 'O2' }, tender: CASH, amount: 1000, taxAmount: 74,
    createdTime: ms('2026-11-22T02:00:00Z'), result: 'SUCCESS', employee: { id: 'E2' } },
  { id: 'P2b', order: { id: 'O2' }, tender: CARD, amount: 1592, taxAmount: 118, tipAmount: 400,
    createdTime: ms('2026-11-22T02:00:30Z'), result: 'SUCCESS', employee: { id: 'E2' } },
  // No tipAmount field at all: a cash sale with no tip.
  { id: 'P3', order: { id: 'O3' }, tender: CASH, amount: 1512, taxAmount: 112,
    createdTime: ms('2026-11-22T03:05:00Z'), result: 'SUCCESS', employee: { id: 'E1' } },
  { id: 'P4', order: { id: 'O4' }, tender: CARD, amount: 648, taxAmount: 48, tipAmount: 100,
    createdTime: ms('2026-11-22T05:20:00Z'), result: 'SUCCESS', employee: { id: 'E2' } },
  { id: 'P5', order: { id: 'O5' }, tender: CARD, amount: 5000, taxAmount: 0,
    createdTime: ms('2026-11-22T02:01:00Z'), result: 'SUCCESS', employee: { id: 'E1' } },
  { id: 'P6', order: { id: 'O6' }, tender: CARD, amount: 999, taxAmount: 0,
    createdTime: ms('2026-11-22T02:11:00Z'), result: 'VOIDED', employee: { id: 'E1' } },
  { id: 'P7', order: { id: 'O7' }, tender: CARD, amount: 2592, taxAmount: 192,
    createdTime: ms('2026-11-23T00:00:00Z'), result: 'SUCCESS', employee: { id: 'E1' } },
  { id: 'P8', order: { id: 'O8' }, tender: CARD, amount: 3078, taxAmount: 228, tipAmount: 600,
    createdTime: ms('2026-11-24T01:00:00Z'), result: 'SUCCESS', employee: { id: 'E2' } },
];

export const refunds: CloverRefund[] = [
  // Partial refund of P1 on the same night: 100 net, 8 tax.
  { id: 'R1', payment: { id: 'P1' }, amount: 108, taxAmount: 8, createdTime: ms('2026-11-22T03:30:00Z') },
  // The Sunday burger, refunded on Monday.
  { id: 'R2', payment: { id: 'P7' }, amount: 1944, taxAmount: 144, createdTime: ms('2026-11-23T23:00:00Z') },
];

export const shifts: CloverShift[] = [
  { id: 'S1', employee: { id: 'E1' }, inTime: ms('2026-11-21T22:00:00Z'), outTime: ms('2026-11-22T04:30:00Z') },
  // The manager corrected the clock-out: the override wins over outTime.
  { id: 'S2', employee: { id: 'E2' }, inTime: ms('2026-11-22T00:00:00Z'),
    outTime: ms('2026-11-22T06:00:00Z'), overrideOutTime: ms('2026-11-22T07:00:00Z') },
  // Still clocked in: not a shift yet.
  { id: 'S3', employee: { id: 'E3' }, inTime: ms('2026-11-23T22:00:00Z') },
];
