import type { createAdminClient } from '@/lib/supabase/admin';
import type { NormalizedPayload } from '@/lib/pos/normalized';
import type { PosConfig } from '@/lib/pos/pos-config';
import type { PosProvider } from '@/lib/pos/credentials';

export type AdapterContext = {
  orgId: string;
  admin: ReturnType<typeof createAdminClient>;
  /** The config as read at the start of the run. Settings only; never written back by an adapter. */
  posConfig: PosConfig;
  /** Business dates, inclusive. */
  from: string;
  to: string;
  /** Items write usage_logs and move stock, so a history pull leaves them off unless asked. */
  includeItems: boolean;
};

/** Fetches and maps. Never touches Supabase tables other than its own credentials. */
export type PosAdapter = {
  provider: PosProvider;
  /** The adapter's own business-date arithmetic needs the zone and cutoff. */
  today(posConfig: PosConfig, now: Date): string;
  fetchPayload(ctx: AdapterContext): Promise<NormalizedPayload>;
};

/** The stored login no longer works and a person has to reconnect. */
export class NeedsReauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NeedsReauthError';
  }
}
