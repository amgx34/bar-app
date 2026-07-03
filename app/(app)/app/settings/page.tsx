import { getCurrentOrg } from '@/lib/org';
import { GeneralTab } from './_components/general-tab';
import { TipPayTab } from './_components/tip-pay-tab';
import { InventoryTab } from './_components/inventory-tab';
import { POSPanel } from './_components/pos-panel';
import { TeamTab } from './_components/team-tab';
import { listTeamMembers } from './team-actions';
import ImportTab from '../payroll/_components/import-tab';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'general',     label: 'General' },
  { key: 'tip-pay',     label: 'Tip & Pay' },
  { key: 'inventory',   label: 'Inventory' },
  { key: 'import-data', label: 'Import Data' },
  { key: 'pos',         label: 'POS Integration' },
  { key: 'team',        label: 'Team' },
];

function buildCloverAuthUrl(orgId: string): string | null {
  const clientId    = process.env.CLOVER_CLIENT_ID;
  const redirectUri = process.env.CLOVER_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;

  const base = process.env.CLOVER_SANDBOX === 'true'
    ? 'https://sandbox.dev.clover.com/oauth/v2/authorize'
    : 'https://www.clover.com/oauth/v2/authorize';

  const url = new URL(base);
  url.searchParams.set('client_id',     clientId);
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state',         orgId);
  return url.toString();
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org, role } = await getCurrentOrg();
  const params   = await searchParams;
  const tab      = params.tab ?? 'general';
  const settings = org.bar_settings ?? { tip_split_percent: 15, default_hourly_rate: 15 };
  const team     = tab === 'team' ? await listTeamMembers() : null;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">{org.name}</p>
      </div>

      {/* Tab nav */}
      <div className="border-b overflow-x-auto">
        <div className="flex gap-6 min-w-max">
          {TABS.map(({ key, label }) => (
            <a
              key={key}
              href={`/app/settings?tab=${key}`}
              className={`px-1 pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'general'     && <GeneralTab  orgName={org.name} role={role} settings={settings} />}
      {tab === 'tip-pay'     && <TipPayTab   role={role}         settings={settings} />}
      {tab === 'inventory'   && <InventoryTab role={role}         settings={settings} />}
      {tab === 'import-data' && (
        <div className="max-w-none">
          <ImportTab posProvider={org.pos_provider} />
        </div>
      )}
      {tab === 'team' && team && (
        <TeamTab initialMembers={team.members} canManage={team.canManage} />
      )}
      {tab === 'pos'         && (
        <POSPanel
          orgId={org.id}
          role={role}
          posProvider={org.pos_provider}
          posConfig={(org.pos_config ?? {}) as Record<string, unknown>}
          cloverAuthUrl={buildCloverAuthUrl(org.id)}
          flashConnected={params.connected === 'clover'}
          flashError={params.error}
        />
      )}
    </div>
  );
}
