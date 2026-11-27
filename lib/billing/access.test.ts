import { describe, it, expect } from 'vitest';
import { accessFor, accessFromLookup, subscriptionToRow, GRACE_DAYS } from './access';

const now = new Date('2026-12-10T00:00:00Z');
const on = { enforce: true, isDemo: false };
const row = (status: string, end: string | null = null) => ({ status, plan: 'close' as const, current_period_end: end });

describe('accessFor', () => {
  it('lets active, trialing and comped through', () => {
    for (const s of ['active', 'trialing', 'comped']) expect(accessFor(row(s), now, on).allowed).toBe(true);
  });
  it('past due keeps working inside the grace window, then blocks', () => {
    const inside = new Date(now.getTime() - (GRACE_DAYS - 1) * 86_400_000).toISOString();
    const outside = new Date(now.getTime() - (GRACE_DAYS + 1) * 86_400_000).toISOString();
    expect(accessFor(row('past_due', inside), now, on)).toMatchObject({ allowed: true, state: 'past_due_grace' });
    expect(accessFor(row('past_due', outside), now, on)).toMatchObject({ allowed: false, state: 'past_due_expired' });
  });
  it('past due with no period end blocks when enforced', () => {
    expect(accessFor(row('past_due'), now, on).allowed).toBe(false);
  });
  it('cancelled, none and incomplete block only when enforcement is on', () => {
    for (const s of ['canceled', 'incomplete']) {
      expect(accessFor(row(s), now, on).allowed).toBe(false);
      expect(accessFor(row(s), now, { enforce: false, isDemo: false }).allowed).toBe(true);
    }
    expect(accessFor(null, now, on)).toMatchObject({ allowed: false, state: 'none' });
    expect(accessFor(null, now, { enforce: false, isDemo: false }).allowed).toBe(true);
  });
  it('demo orgs are always exempt', () => {
    expect(accessFor(row('canceled'), now, { enforce: true, isDemo: true }).allowed).toBe(true);
  });
});

describe('subscriptionToRow', () => {
  it('maps price id to plan and reads the item period end', () => {
    const r = subscriptionToRow(
      { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { organization_id: 'org-1' },
        items: { data: [{ current_period_end: 1_800_000_000, price: { id: 'price_whole' } }] } },
      { price_whole: 'whole_bar' },
    );
    expect(r).toMatchObject({ organization_id: 'org-1', plan: 'whole_bar', stripe_customer_id: 'cus_1', status: 'active' });
    expect(r.current_period_end).toBe(new Date(1_800_000_000_000).toISOString());
  });
  it('unknown price gives null plan', () => {
    expect(subscriptionToRow({ items: { data: [{ price: { id: 'x' } }] } }, {}).plan).toBeNull();
  });
});

describe('accessFromLookup', () => {
  it('fails open when the lookup errored, even with enforcement on', () => {
    expect(accessFromLookup({ row: null, failed: true }, now, on)).toMatchObject({ allowed: true, state: 'not_enforced' });
  });
  it('a clean lookup with no row is still blocked under enforcement', () => {
    expect(accessFromLookup({ row: null, failed: false }, now, on)).toMatchObject({ allowed: false, state: 'none' });
  });
  it('a clean lookup defers to accessFor', () => {
    expect(accessFromLookup({ row: row('active'), failed: false }, now, on)).toMatchObject({ allowed: true, state: 'active' });
  });
});
