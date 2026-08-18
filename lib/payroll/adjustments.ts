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

    out.set(t.fromEmployeeId, (out.get(t.fromEmployeeId) ?? 0) - t.amount);
    out.set(t.toEmployeeId, (out.get(t.toEmployeeId) ?? 0) + t.amount);
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
