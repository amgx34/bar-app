-- Teach payroll_adjustments_shape about tip_removal.
--
-- WHY THIS EXISTS SEPARATELY FROM 20260821000001
--
-- 20260821000001 widened `payroll_adjustments_kind_check` and dropped the
-- NOT NULL on employee_id, and both of those applied. It was still not enough:
-- 20260817000006 also carries a table-level CHECK, payroll_adjustments_shape,
-- written as an OR over exactly two branches —
--
--   (kind = 'hours'        AND hours_before/after present, amount NULL)
--   OR
--   (kind = 'tip_transfer' AND counterparty + amount present, hours NULL)
--
-- A 'tip_removal' row satisfies neither branch, so every insert failed with
-- 23514 against `payroll_adjustments_shape` even though the kind was by then
-- perfectly legal. The constraint is doing exactly its job: it exists so a
-- malformed row cannot be applied as though it were a different kind, and a
-- kind it has never heard of is precisely a malformed row.
--
-- THE THIRD BRANCH
--
-- A removal carries an amount and nothing else:
--   * amount        — required and positive; there is no such thing as
--                     removing nothing, and a NULL would be read as "remove
--                     nothing" by one caller and "remove everything" by another
--   * counterparty  — NULL; money leaves the pool, it does not move between two
--                     people. That is what tip_transfer is for
--   * hours_*       — NULL; a removal is money, not time
--   * employee_id   — deliberately unconstrained. NULL means the pool itself
--                     shrank (a garnishment); a value means the cash went to
--                     that person. Both are legitimate, which is why
--                     20260821000001 relaxed the column
--
-- The other two branches are reproduced verbatim. A CHECK cannot be altered in
-- place, so it is dropped and recreated, and any drift between the old text and
-- the new would silently change what an 'hours' or 'tip_transfer' row is
-- allowed to be.

ALTER TABLE payroll_adjustments
  DROP CONSTRAINT IF EXISTS payroll_adjustments_shape;

ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_shape CHECK (
    (kind = 'hours'
      AND hours_before IS NOT NULL AND hours_after IS NOT NULL
      AND counterparty_employee_id IS NULL AND amount IS NULL)
    OR
    (kind = 'tip_transfer'
      AND counterparty_employee_id IS NOT NULL AND amount IS NOT NULL AND amount > 0
      AND hours_before IS NULL AND hours_after IS NULL)
    OR
    (kind = 'tip_removal'
      AND amount IS NOT NULL AND amount > 0
      AND counterparty_employee_id IS NULL
      AND hours_before IS NULL AND hours_after IS NULL)
  );

-- payroll_adjustments_removal_amount from 20260821000001 now says the same
-- thing as the branch above. Left in place rather than dropped: it is cheap,
-- it is not wrong, and removing a constraint to tidy up is how a rule gets
-- lost in a later refactor.
