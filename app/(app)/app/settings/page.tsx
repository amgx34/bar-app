import { getCurrentOrg } from '@/lib/org';
import { GeneralTab } from './_components/general-tab';
import { TipPayTab } from './_components/tip-pay-tab';
import { InventoryTab } from './_components/inventory-tab';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'general',   label: 'General' },
  { key: 'tip-pay',   label: 'Tip & Pay' },
  { key: 'inventory', label: 'Inventory' },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org, role } = await getCurrentOrg();
  const params = await searchParams;
  const tab = params.tab ?? 'general';
  const settings = org.bar_settings ?? { tip_split_percent: 15, default_hourly_rate: 15 };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">{org.name}</p>
      </div>

      {/* Tab nav */}
      <div className="border-b">
        <div className="flex gap-8">
          {TABS.map(({ key, label }) => (
            <a
              key={key}
              href={`/app/settings?tab=${key}`}
              className={`px-1 pb-4 text-sm font-medium border-b-2 transition-colors ${
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
      {tab === 'general'   && <GeneralTab  orgName={org.name} role={role} settings={settings} />}
      {tab === 'tip-pay'   && <TipPayTab   role={role}         settings={settings} />}
      {tab === 'inventory' && <InventoryTab role={role}         settings={settings} />}
    </div>
  );
}
