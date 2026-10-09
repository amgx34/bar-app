import { describe, it, expect } from 'vitest';
import { describeOpenRun, canSeeOpenRun, type OpenRun } from './open-run';

const run = (over: Partial<OpenRun> = {}): OpenRun => ({
  periodStart: '2026-10-01',
  periodEnd:   '2026-10-07',
  status:      'pending_approval',
  reviewNote:  null,
  employees:   12,
  total:       14208,
  alsoWaiting: 0,
  ...over,
});

describe('describeOpenRun', () => {
  it('gives the owner the verb on a run awaiting approval', () => {
    const n = describeOpenRun(run(), 'owner')!;
    expect(n.headline).toMatch(/awaiting your approval/);
    expect(n.cta).toBe('Review and approve');
    expect(n.tone).toBe('waiting');
  });

  it('tells a manager where their submission got to, without a verb they cannot use', () => {
    // Only an owner can approve. A manager offered "Approve" would click it and
    // be refused by canApprovePayroll — a banner that lies about what you can do
    // is worse than no banner.
    const n = describeOpenRun(run(), 'manager')!;
    expect(n.headline).toMatch(/with the owner/);
    expect(n.headline).not.toMatch(/your approval/);
    expect(n.cta).toBe('View');
  });

  it('keeps an accountant informed and gives them nothing to press', () => {
    // They are on ROLE_DEFAULTS for payroll.approval_needed, so they are told
    // about this event already; the screen must not then be silent. But they can
    // neither submit nor approve.
    const n = describeOpenRun(run(), 'accountant')!;
    expect(n.headline).toMatch(/with the owner/);
    expect(n.cta).toBeNull();
  });

  it('carries the scale so the banner is not a bare status word', () => {
    const n = describeOpenRun(run(), 'owner')!;
    expect(n.headline).toMatch(/12 employees/);
    expect(n.headline).toMatch(/\$14,208/);
  });

  it('says "employee" when there is one of them', () => {
    expect(describeOpenRun(run({ employees: 1 }), 'owner')!.headline).toMatch(/1 employee ·/);
  });

  describe('a run that was sent back', () => {
    const sent = run({ status: 'changes_requested', reviewNote: "Dave's Friday hours look wrong" });

    it('reaches the submitter with the reason attached', () => {
      // The note is the whole point of a send-back. Behind a click it is a
      // second thing to go looking for, which is how the run stalled before.
      const n = describeOpenRun(sent, 'manager')!;
      expect(n.headline).toMatch(/sent back/);
      expect(n.note).toBe("Dave's Friday hours look wrong");
      expect(n.cta).toBe('Fix and resubmit');
      expect(n.tone).toBe('returned');
    });

    it('is actionable for an owner too, who can also submit', () => {
      // Most bars are one owner and no managers, so the owner is usually the
      // person who has to act on their own send-back.
      expect(describeOpenRun(sent, 'owner')!.cta).toBe('Fix and resubmit');
    });

    it('is read-only for an accountant', () => {
      expect(describeOpenRun(sent, 'accountant')!.cta).toBeNull();
    });

    it('survives a send-back whose note did not survive the round trip', () => {
      expect(describeOpenRun(run({ status: 'changes_requested' }), 'owner')!.note).toBeNull();
    });
  });

  it('names other open periods rather than hiding them', () => {
    // The unique index is per period, so two can be open at once. Showing only
    // the newest would be a second way for a pay run to go unnoticed.
    expect(describeOpenRun(run({ alsoWaiting: 2 }), 'owner')!.extra).toBe('+2 more waiting');
    expect(describeOpenRun(run(), 'owner')!.extra).toBeNull();
  });

  it('shows nothing when there is no open run', () => {
    expect(describeOpenRun(null, 'owner')).toBeNull();
  });

  it('shows nothing to a role with no business seeing payroll', () => {
    // @ts-expect-error — exercising a role outside the payroll set on purpose.
    expect(describeOpenRun(run(), 'staff')).toBeNull();
    // @ts-expect-error — same.
    expect(canSeeOpenRun('staff')).toBe(false);
  });
});
