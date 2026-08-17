-- Where a demo request came from.
--
-- Captured client-side on the first page of the visit (lib/utm.ts) and carried
-- to whatever the visitor eventually submits. Stored as JSONB rather than seven
-- columns because the shape is not ours: ad platforms add parameters, and a
-- schema change per platform is not worth it for a marketing attribute.
--
-- Nullable and never required. A request that arrives with no attribution is a
-- direct visit, which is a perfectly ordinary outcome — attribution must never
-- be a reason a lead fails to save.

ALTER TABLE demo_requests
  ADD COLUMN IF NOT EXISTS attribution JSONB;

COMMENT ON COLUMN demo_requests.attribution IS
  'First-touch campaign parameters (utm_*, gclid, fbclid, referrer host, landing path). '
  'Written by submitDemoRequest from lib/utm.ts. Contains no identifiers and no full URLs.';
