-- Makes the two direct-deposit mutations atomic.
--
-- Both flows previously ran as a sequence of separate statements from the app,
-- with no transaction around them. The add flow is the dangerous one:
--
--   1. mark the verification code used
--   2. deactivate the employee's existing account at that priority
--   3. insert the replacement
--   4. write the audit entry
--
-- A failure at 3 left the employee with NO active account and a code already
-- consumed at 1 — so payroll had nowhere to pay them and they could not retry
-- without requesting a new code. A failure at 4 left a bank change with no
-- audit trail, which is the record you most need when money moves.
--
-- Everything below commits or rolls back as a unit.
--
-- Encryption stays in the application: DD_ENCRYPTION_KEY never leaves the app,
-- and these functions receive ciphertext only. The database cannot read an
-- account number even with full access to these rows.

-- ── Add / replace an account ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dd_commit_account(
  p_org_id            UUID,
  p_verification_id   UUID,
  p_employee_id       UUID,
  p_routing_encrypted TEXT,
  p_account_encrypted TEXT,
  p_account_last4     TEXT,
  p_bank_name         TEXT,
  p_account_type      TEXT,
  p_deposit_type      TEXT,
  p_deposit_value     INTEGER,
  p_priority          SMALLINT,
  p_consent_text      TEXT,
  p_audit_after       JSONB
)
RETURNS direct_deposit_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account direct_deposit_accounts;
  v_code_org UUID;
BEGIN
  -- Re-check tenancy here rather than trusting the caller. This function runs
  -- as its owner, so it is the last line of defence if a caller ever passes an
  -- org id that is not the signed-in one.
  SELECT organization_id INTO v_code_org
  FROM dd_verification_codes
  WHERE id = p_verification_id
  FOR UPDATE;

  IF v_code_org IS NULL OR v_code_org <> p_org_id THEN
    RAISE EXCEPTION 'Verification session not found.';
  END IF;

  -- Consuming the code inside the transaction means a later failure rolls the
  -- consumption back too, so the operator can retry with the same code instead
  -- of being locked out mid-change.
  UPDATE dd_verification_codes
  SET is_used = true, verified_at = NOW()
  WHERE id = p_verification_id;

  UPDATE direct_deposit_accounts
  SET is_active = false, updated_at = NOW()
  WHERE organization_id = p_org_id
    AND employee_id     = p_employee_id
    AND priority        = p_priority
    AND is_active       = true;

  INSERT INTO direct_deposit_accounts (
    organization_id, employee_id,
    routing_encrypted, account_encrypted, account_last4,
    bank_name, account_type, deposit_type, deposit_value, priority,
    prenote_sent_at, consent_text
  )
  VALUES (
    p_org_id, p_employee_id,
    p_routing_encrypted, p_account_encrypted, p_account_last4,
    p_bank_name, p_account_type, p_deposit_type, p_deposit_value, p_priority,
    -- Column name is historical: this records the enrolment date. Rail does
    -- not send real bank prenotes.
    NOW(), p_consent_text
  )
  RETURNING * INTO v_account;

  INSERT INTO dd_audit_log (organization_id, employee_id, action, after_state, code_id)
  VALUES (p_org_id, p_employee_id, 'ACCOUNT_ADDED', p_audit_after, p_verification_id);

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION dd_commit_account(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, SMALLINT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dd_commit_account(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, SMALLINT, TEXT, JSONB
) TO service_role;

-- ── Deactivate an account ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dd_delete_account(
  p_org_id          UUID,
  p_verification_id UUID,
  p_account_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code_org    UUID;
  v_employee_id UUID;
  v_before      JSONB;
BEGIN
  SELECT organization_id INTO v_code_org
  FROM dd_verification_codes
  WHERE id = p_verification_id
  FOR UPDATE;

  IF v_code_org IS NULL OR v_code_org <> p_org_id THEN
    RAISE EXCEPTION 'Verification session not found.';
  END IF;

  -- Capture the prior state before mutating, so the audit row is accurate even
  -- though it is written after the update.
  SELECT employee_id,
         jsonb_build_object('account_last4', account_last4, 'bank_name', bank_name)
    INTO v_employee_id, v_before
  FROM direct_deposit_accounts
  WHERE id = p_account_id
    AND organization_id = p_org_id
  FOR UPDATE;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Account not found.';
  END IF;

  UPDATE dd_verification_codes
  SET is_used = true, verified_at = NOW()
  WHERE id = p_verification_id;

  UPDATE direct_deposit_accounts
  SET is_active = false, updated_at = NOW()
  WHERE id = p_account_id
    AND organization_id = p_org_id;

  -- Matches the value the app has always written, so existing audit history
  -- stays queryable with one action name.
  INSERT INTO dd_audit_log (organization_id, employee_id, action, before_state, code_id)
  VALUES (p_org_id, v_employee_id, 'ACCOUNT_DELETED', v_before, p_verification_id);

  RETURN v_before;
END;
$$;

REVOKE ALL ON FUNCTION dd_delete_account(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dd_delete_account(UUID, UUID, UUID) TO service_role;

-- ── JSONB retention ─────────────────────────────────────────────────────────
-- ai_breakdown and the direct-deposit audit states are unbounded JSONB with no
-- retention policy, so they grow forever. The audit trail is deliberately kept
-- for seven years (a bank-change record is exactly what a dispute needs); only
-- the payload is dropped, never the fact that the change happened.

CREATE OR REPLACE FUNCTION prune_jsonb_payloads(
  p_audit_retain_days INTEGER DEFAULT 2555,   -- ~7 years
  p_ai_retain_days    INTEGER DEFAULT 400     -- one tax year plus a margin
)
RETURNS TABLE (audit_rows_stripped INTEGER, ai_rows_stripped INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_audit INTEGER := 0;
  v_ai    INTEGER := 0;
BEGIN
  UPDATE dd_audit_log
  SET before_state = NULL, after_state = NULL
  WHERE created_at < NOW() - make_interval(days => p_audit_retain_days)
    AND (before_state IS NOT NULL OR after_state IS NOT NULL);
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- Guarded: bar_messages.ai_breakdown is added by a later migration in some
  -- environments, and this function must not fail where it does not exist yet.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'bar_messages'
      AND column_name  = 'ai_breakdown'
  ) THEN
    EXECUTE format(
      'UPDATE bar_messages SET ai_breakdown = NULL
         WHERE created_at < NOW() - make_interval(days => %L::INTEGER)
           AND ai_breakdown IS NOT NULL',
      p_ai_retain_days
    );
    GET DIAGNOSTICS v_ai = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_audit, v_ai;
END;
$$;

REVOKE ALL ON FUNCTION prune_jsonb_payloads(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_jsonb_payloads(INTEGER, INTEGER) TO service_role;
