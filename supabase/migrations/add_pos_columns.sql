-- Run this in your Supabase SQL editor before deploying the POS/settings features.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pos_provider  text    CHECK (pos_provider IN ('clover','toast','2touch')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pos_config    jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bar_settings  jsonb   NOT NULL DEFAULT '{"tip_split_percent":15,"default_hourly_rate":15.00}';

CREATE INDEX IF NOT EXISTS idx_org_pos_provider ON organizations(pos_provider);
