-- Credentials for POS sources Rail pulls from (Clover, Toast).
--
-- WHY NOT pos_config: lib/org.ts selects pos_config into every membership row,
-- so a token stored there already reaches every server component that loads an
-- org. Clover's refresh token is also single use, which needs compare-and-swap,
-- and a JSON blob with two writers cannot give that without the lost-update
-- bug the agent_version note in AGENTS.md describes.
--
-- Service role only: RLS is enabled with NO policies, so no anon or
-- authenticated client can read or write it. All access goes through
-- lib/pos/credentials.ts. `secrets` is ciphertext (lib/direct-deposit/crypto.ts,
-- DD_ENCRYPTION_KEY), never plaintext.
--
-- NOT APPLIED by any code in the repo. The app works without it: credentials.ts
-- falls back to pos_config.credentials_enc when this table is missing, without
-- compare-and-swap, and says so in the log.

create table if not exists pos_credentials (
  organization_id  uuid primary key references organizations(id) on delete cascade,
  provider         text not null check (provider in ('clover', 'toast')),
  -- clover merchant id | toast restaurant guid
  external_id      text not null,
  secrets          text not null,
  -- Compare-and-swap token: an update names the version it read and bumps it.
  version          integer not null default 1,
  -- Serialises syncs for one org: a run takes it, others skip until it lapses.
  sync_lease_until timestamptz,
  updated_at       timestamptz not null default now()
);

create index if not exists ix_pos_credentials_external
  on pos_credentials (provider, external_id);

alter table pos_credentials enable row level security;
