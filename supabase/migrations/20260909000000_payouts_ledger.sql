-- ── payroll_payouts becomes a ledger ─────────────────────────────────────────
-- The table was one row per employee per period, and unpaid was the absence of
-- a row. Advances break that: an owner can now hand somebody money twice in one
-- period, so a period holds a list of payments and "fully paid" becomes a sum.
--
-- What does NOT change: there is still no status column. Fully-paid is derived,
-- so there remains nothing stored that can go stale against a run recomputed
-- underneath it.

-- Many payments per person per period.
DROP INDEX IF EXISTS ux_payroll_payout_employee_period;

-- Which days the amount was computed from. NULL means the whole period — which
-- is what every existing row means and what a plain "mark paid" still means, so
-- there is no backfill.
--
-- Recorded for the receipt, NOT as state: days are never "settled". See the
-- design doc for why settling days underpays anyone whose later shifts push
-- their week past forty hours.
ALTER TABLE payroll_payouts ADD COLUMN IF NOT EXISTS covers_days DATE[];

-- Replaces what the dropped index was really buying. Its stated job was making
-- "a double-tap on a slow phone an idempotent no-op rather than a second row
-- that would read as having paid somebody twice" — and a ledger cannot key on
-- the old columns, because two payments in one period is now the point.
--
-- The client generates this when the payout dialog opens, so the same tap twice
-- carries the same key and the second write collides instead of paying again.
ALTER TABLE payroll_payouts ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Backfill existing rows with distinct UUIDs. Every historical row is a real,
-- distinct payment, so each receives its own idempotency key and cannot collide.
UPDATE payroll_payouts SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL;

-- NOT NULL constraint: the old index protected all rows unconditionally. A
-- nullable key would silently allow a future caller to reintroduce double
-- payments by omitting the key. Instead, fail loudly at the constraint layer:
-- any caller that omits idempotency_key now hits a NOT NULL violation, which is
-- the better failure mode. markPaid (the only writer) already requires the key.
ALTER TABLE payroll_payouts ALTER COLUMN idempotency_key SET NOT NULL;

-- Unconditional unique index, matching the guarantee of the old index it
-- replaces. No WHERE clause: all rows, including those added in the future, are
-- protected against duplicate payment.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_payout_idempotency
  ON payroll_payouts (organization_id, idempotency_key);

-- The period read is now a list rather than a lookup, and it is the payroll
-- screen's only query against this table.
CREATE INDEX IF NOT EXISTS ix_payroll_payout_period_employee
  ON payroll_payouts (organization_id, period_start, period_end, employee_id);
