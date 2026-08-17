-- Fixed-window rate limiting, shared across serverless instances.
--
-- The three public entry points — POST /api/demo, the contact form, and login —
-- take no session, so nothing bounded them. In-memory counters do not work here:
-- each Vercel lambda has its own memory, so an attacker spreading requests
-- across cold starts bypasses them entirely. Postgres is the only state all
-- instances already share.

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- Supports the sweep below; the PK already covers the hot lookup path.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- No policies are defined on purpose. Every read and write goes through the
-- SECURITY DEFINER function below, so anon and authenticated get nothing here
-- even if a query somehow reaches the table.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ── Atomic counter ──────────────────────────────────────────────────────────
-- A SELECT-then-UPDATE would let two concurrent requests both read the same
-- count and both pass. INSERT ... ON CONFLICT DO UPDATE ... RETURNING settles
-- it in one statement, holding a row lock for its duration.

CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_bucket         TEXT,
  p_limit          INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned: without it a caller-controlled search_path could resolve the table
-- or the operators below to attacker-supplied objects.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_hits         INTEGER;
BEGIN
  IF p_window_seconds <= 0 OR p_limit < 0 THEN
    RAISE EXCEPTION 'rate_limit_hit: limit must be >= 0 and window must be > 0';
  END IF;

  -- Floor now() to the window boundary so every instance agrees on which
  -- window a request falls in without coordinating.
  --
  -- extract(epoch ...) returns numeric on PG14+, and there is no
  -- to_timestamp(numeric) — it resolves only via an implicit cast. Made
  -- explicit so the overload can never be ambiguous.
  v_window_start := to_timestamp(
    (floor(extract(EPOCH FROM now()) / p_window_seconds) * p_window_seconds)::DOUBLE PRECISION
  );

  INSERT INTO rate_limits AS rl (bucket, window_start, hits)
  VALUES (p_bucket, v_window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = rl.hits + 1
  RETURNING rl.hits INTO v_hits;

  RETURN QUERY SELECT
    v_hits <= p_limit,
    GREATEST(p_limit - v_hits, 0),
    CEIL(EXTRACT(EPOCH FROM
      (v_window_start + make_interval(secs => p_window_seconds)) - now()
    ))::INTEGER;
END;
$$;

-- Only the service role calls this; the app never reaches it as anon.
REVOKE ALL ON FUNCTION rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- ── Sweep ───────────────────────────────────────────────────────────────────
-- Expired windows are dead weight; without this the table grows forever.
-- Called from the existing daily cron.

CREATE OR REPLACE FUNCTION rate_limit_sweep(p_older_than_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < now() - make_interval(hours => p_older_than_hours);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION rate_limit_sweep(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate_limit_sweep(INTEGER) TO service_role;
