import type { Role } from '@/lib/permissions';

/**
 * How an unfinished pay run should be announced outside the review screen.
 *
 * A submitted run lived only on /app/payroll/review. Nothing on the Pay Run or
 * Employees tabs read `payroll_runs` at all, so a manager submitted a period,
 * the owner was never shown it anywhere they already were, and the run sat
 * waiting — the workflow completing silently on a screen nobody had a reason to
 * open. The same was true in reverse for a run sent back: the note explaining
 * what to fix was only visible to someone who went looking for it.
 *
 * Pure, and separated from the query for the same reason detect.ts is separate
 * from deliver.ts — the decision about what a given person should be told is
 * the interesting part, and it is worth being able to test it without a
 * database.
 */

export type OpenRunStatus = 'pending_approval' | 'changes_requested';

export type OpenRun = {
  periodStart: string;
  periodEnd:   string;
  status:      OpenRunStatus;
  /** Whoever must act on a send-back needs the reason with it, not a click away. */
  reviewNote:  string | null;
  employees:   number;
  total:       number;
  /** Open runs beyond this one. Named rather than hidden — see below. */
  alsoWaiting: number;
};

export type OpenRunNotice = {
  /** What this person is being told, in their own terms. */
  headline: string;
  /** The note on a send-back, when there is one to show. */
  note:     string | null;
  /** Label for the link. Null when this person cannot act and is only being kept informed. */
  cta:      string | null;
  /** Drives the colour: an open task is amber, a send-back is a correction. */
  tone:     'waiting' | 'returned';
  /** "+2 more waiting", or null. */
  extra:    string | null;
};

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Whether this person is shown anything at all.
 *
 * Accountants are included deliberately, even though they can neither submit
 * nor approve. ROLE_DEFAULTS already sends them `payroll.approval_needed`, and
 * a role the system tells about an event should not then find every screen
 * silent about it. They get the sentence and no button.
 */
export function canSeeOpenRun(role: Role): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

/**
 * The notice for one person, or null if they should see nothing.
 *
 * The split is by who must ACT, not by who has permission in general:
 *
 *   • A run awaiting approval is the owner's task — only an owner can approve
 *     one — so only an owner gets a verb. A manager sees that the thing they
 *     submitted is where they left it, which is the question they would
 *     otherwise reopen the review screen to answer.
 *   • A run sent back is the opposite: the owner has already done their part,
 *     and it is a submitter who has to fix it. Both of them can submit, so
 *     both get the verb.
 */
export function describeOpenRun(run: OpenRun | null, role: Role): OpenRunNotice | null {
  if (!run || !canSeeOpenRun(role)) return null;

  const period = `${run.periodStart} to ${run.periodEnd}`;
  const scale  = `${run.employees} ${run.employees === 1 ? 'employee' : 'employees'} · ${money(run.total)}`;

  // Named rather than hidden. The unique index is per period, so two periods
  // can be open at once, and a banner that silently showed only the newest
  // would be a second way for a pay run to go unnoticed — which is the bug
  // this whole component exists to fix.
  const extra = run.alsoWaiting > 0
    ? `+${run.alsoWaiting} more waiting`
    : null;

  if (run.status === 'changes_requested') {
    const canFix = role === 'owner' || role === 'manager';
    return {
      headline: `${period} was sent back — ${scale}`,
      note:     run.reviewNote,
      cta:      canFix ? 'Fix and resubmit' : null,
      tone:     'returned',
      extra,
    };
  }

  if (role === 'owner') {
    return {
      headline: `${period} is awaiting your approval — ${scale}`,
      note:     null,
      cta:      'Review and approve',
      tone:     'waiting',
      extra,
    };
  }

  return {
    headline: `${period} is submitted and with the owner — ${scale}`,
    note:     null,
    // No verb: a manager cannot approve, and an accountant can do neither.
    // Offering an action nobody can complete is how a banner teaches people to
    // stop reading banners.
    cta:      role === 'manager' ? 'View' : null,
    tone:     'waiting',
    extra,
  };
}
