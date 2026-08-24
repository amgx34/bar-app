/**
 * Manual corrections applied on top of a computed pay run, and the opener bonus.
 *
 * Deliberately pure — no database, no clock. This is the arithmetic that decides
 * what people are paid, and it is the part worth being able to test directly.
 * The server action does the I/O either side of it.
 */

export type TipTransfer = {
  /** Loses the money. */
  fromEmployeeId: string;
  /** Gains it. */
  toEmployeeId: string;
  /** Always positive. Direction is carried by the two ids, not by the sign. */
  amount: number;
};

export type OpenerBonusType = 'none' | 'fixed' | 'percentage' | 'hours';

export type OpenerBonusConfig = {
  type: OpenerBonusType;
  /** Dollars (fixed), percent of the pool (percentage), or hours (hours). */
  value: number;
};

/**
 * Applies tip transfers to a map of employee id to tip amount.
 *
 * The total is conserved: whatever one person loses, another gains. That is the
 * property that makes this safe to run against a split that already balances
 * against the night's takings — the pool total does not move, only who holds it.
 *
 * A transfer is NOT clamped to the giver's balance. Someone can legitimately end
 * up owing more than the split gave them (a mis-keyed sale corrected after the
 * fact), and silently truncating the amount would produce a total that no longer
 * matches what the operator agreed with their staff.
 */
export function applyTipTransfers(
  tipsByEmployee: Map<string, number>,
  transfers: TipTransfer[],
): Map<string, number> {
  const out = new Map(tipsByEmployee);

  for (const t of transfers) {
    if (!(t.amount > 0)) continue;
    if (t.fromEmployeeId === t.toEmployeeId) continue;

    // Capped at what the sender holds RIGHT NOW, and the recipient gets only
    // what actually moved.
    //
    // A transfer is entered against the figures of the moment, and those
    // figures move afterwards: an hours correction, a switch to hourly pay, a
    // shift removed. Uncapped, a sender whose earnings later fell below what
    // they gave away finishes on a negative tip figure, which flows straight
    // into total compensation and pays them LESS than their wage.
    //
    // Capping still conserves the night — it moves less, never more — and it
    // cannot invent money that was not earned.
    const held = Math.max(0, out.get(t.fromEmployeeId) ?? 0);
    const moved = Math.min(t.amount, held);
    if (moved <= 0) continue;

    out.set(t.fromEmployeeId, held - moved);
    out.set(t.toEmployeeId, (out.get(t.toEmployeeId) ?? 0) + moved);
  }

  return out;
}

export type OpenerBonusResult = {
  /** Extra tips credited to the opener, in dollars. */
  bonusTips: number;
  /** Extra paid hours credited to the opener. */
  bonusHours: number;
  /**
   * Taken back off the rest of the pool, in dollars. Zero for the `hours` type,
   * which is paid by the bar rather than out of the tips.
   */
  fundedFromPool: number;
};

const NONE: OpenerBonusResult = { bonusTips: 0, bonusHours: 0, fundedFromPool: 0 };

/**
 * What the opener earns on top of their share for one night.
 *
 * The three types are funded differently, which is the part that matters:
 *
 *   fixed / percentage  come OUT OF the tip pool — the opener's extra is the
 *                       other bartenders' loss, which is how a bar that agreed
 *                       "the opener gets an extra 5%" actually operates.
 *   hours               is paid BY THE BAR as extra hours at the opener's rate.
 *                       It never touches the pool, because the setup time it
 *                       compensates was not tipped work.
 *
 * Getting that backwards would either pay the bonus twice or take it from the
 * wrong people.
 */
export function openerBonus(
  config: OpenerBonusConfig,
  poolTips: number,
): OpenerBonusResult {
  if (config.type === 'none' || !(config.value > 0)) return NONE;

  switch (config.type) {
    case 'fixed': {
      // Never more than the pool holds — a $25 bonus on a $10 night cannot
      // leave the rest of the pool negative.
      const bonus = Math.min(config.value, Math.max(0, poolTips));
      return { bonusTips: bonus, bonusHours: 0, fundedFromPool: bonus };
    }

    case 'percentage': {
      // Clamped at 100: a percentage above that would take more than exists.
      const pct = Math.min(config.value, 100) / 100;
      const bonus = Math.max(0, poolTips) * pct;
      return { bonusTips: bonus, bonusHours: 0, fundedFromPool: bonus };
    }

    case 'hours':
      // Capped at a double shift. This is hand-entered, and a mistyped "80"
      // would otherwise quietly add a week's pay to one night.
      return {
        bonusTips: 0,
        bonusHours: Math.min(config.value, 24),
        fundedFromPool: 0,
      };

    default:
      return NONE;
  }
}

/** Reads the bonus config off `bar_settings`, tolerating older shapes. */
export function openerBonusFromSettings(settings: {
  opener_bonus_type?: string | null;
  opener_bonus_value?: number | null;
}): OpenerBonusConfig {
  const type = settings.opener_bonus_type;
  const valid: OpenerBonusType[] = ['none', 'fixed', 'percentage', 'hours'];

  return {
    type: valid.includes(type as OpenerBonusType) ? (type as OpenerBonusType) : 'none',
    value: Number(settings.opener_bonus_value) || 0,
  };
}

/**
 * Money taken out of a night's tips before anybody's share is worked out.
 *
 * The case this exists for is a court-ordered or otherwise legally required
 * payout handed over in cash: it leaves the pool, so it must not be split, and
 * it has to be explainable months later.
 */
export type TipRemoval = {
  /** Always positive. Non-positive and non-finite values are ignored. */
  amount: number;
  /**
   * Who the cash went to, when that is a specific person. Null when the money
   * simply left the pool — the pool, not an individual, is what shrank.
   */
  employeeId: string | null;
  /** Required by the table. This is the whole point of logging it separately. */
  reason: string;
};

export type TipRemovalResult = {
  /** What is left to split between barbacks and the bartender pool. */
  tipsAfterRemoval: number;
  /** What actually came out, after clamping. */
  removed: number;
  /**
   * Removals asked for more than the night made. The figure is clamped, but the
   * caller should say so — silently paying out less than was recorded is how a
   * legal payout goes missing.
   */
  overdrawn: boolean;
};

/**
 * Takes removals off the top of a night's tips.
 *
 * Applied BEFORE the barback cut and the bartender split, so a removal shrinks
 * everybody's share proportionally rather than coming out of one pocket. That
 * is what "removed from the pool" means: the night is simply smaller.
 *
 * Clamped at zero. A negative pool would hand every bartender a negative share
 * and the pay run would stop reconciling against the Z report, which is a much
 * worse failure than a clamped figure plus a warning.
 */
export function applyTipRemovals(
  dailyTips: number,
  removals: TipRemoval[],
): TipRemovalResult {
  const requested = removals.reduce((sum, r) => {
    // A removal attributed to a person is a CASH-OUT, not a shrinking of the
    // night: that money was always going to be theirs, it just left the
    // building as cash instead of on a paycheck. Taking it off the pool here
    // would make everyone else's share smaller to pay one person, and would
    // then be deducted a second time by applyEmployeeRemovals.
    if (r.employeeId !== null && r.employeeId !== undefined) return sum;
    const n = Number(r.amount);
    // Junk in one row must not poison the night's total.
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);

  const available = Math.max(0, Number(dailyTips) || 0);
  const removed = Math.min(requested, available);

  return {
    tipsAfterRemoval: available - removed,
    removed,
    overdrawn: requested > available,
  };
}

/** Below this, a difference is float noise rather than a real discrepancy. */
const HALF_CENT = 0.005;

export type EmployeeRemovalResult = {
  /** The split, with each person's cash-out deducted. */
  tipsByEmployee: Map<string, number>;
  /** Total actually taken out, after clamping. */
  removed: number;
  /** Cash-outs larger than the person held. Clamped, but the caller must say so. */
  overdrawn: { employeeId: string; requested: number; applied: number }[];
};

/**
 * Deducts a cash-out from the person who was handed the cash.
 *
 * TWO KINDS OF REMOVAL, AND WHY THEY DIFFER
 *
 * A removal with no employee is a claim against the HOUSE pool — a garnishment
 * — so it comes off the night before anybody's share is worked out and everyone
 * earns proportionally less. applyTipRemovals does that.
 *
 * A removal naming an employee is that person being paid their own tips in
 * cash. Nobody else's share changes, because that money was never anyone
 * else's. Taking it off the pool instead would quietly move the cost of paying
 * one bartender onto all the others.
 *
 * APPLIED AFTER TRANSFERS
 *
 * A manual transfer changes who holds what, so somebody cashed out "for all
 * they had" was cashed out for their FINAL figure. Deducting before transfers
 * would measure against a number they never actually held.
 *
 * Clamped at zero: tips are not a debt, and a negative figure here would flow
 * straight into total compensation and pay somebody a reduced wage.
 */
export function applyEmployeeRemovals(
  tips: Map<string, number>,
  removals: TipRemoval[],
): EmployeeRemovalResult {
  const out = new Map(tips);
  const overdrawn: { employeeId: string; requested: number; applied: number }[] = [];

  // Summed per person first: two cash-outs on one night must not each be
  // clamped against the full balance and remove more than was there.
  const wanted = new Map<string, number>();
  for (const r of removals) {
    if (r.employeeId === null || r.employeeId === undefined) continue;
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    wanted.set(r.employeeId, (wanted.get(r.employeeId) ?? 0) + n);
  }

  let removed = 0;
  for (const [employeeId, requested] of wanted) {
    const held = Math.max(0, out.get(employeeId) ?? 0);
    const applied = Math.min(requested, held);
    out.set(employeeId, held - applied);
    removed += applied;
    // Half a cent of tolerance. A share worked out as a fraction of a pool is
    // never exactly the round figure somebody counted into an envelope: cashing
    // a barback out for $117.20 when the split gives them $117.1975 is the same
    // money, and flagging it would put a permanent "removed more than they had"
    // warning on a correct pay run.
    if (requested - held > HALF_CENT) overdrawn.push({ employeeId, requested, applied });
  }

  return { tipsByEmployee: out, removed, overdrawn };
}
