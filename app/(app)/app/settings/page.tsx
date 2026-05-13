import { getCurrentOrg } from '@/lib/org';
import { BarSettingsForm } from './_components/bar-settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { org, role } = await getCurrentOrg();

  return (
    <div className="p-6 space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">{org.name}</p>
      </div>

      <BarSettingsForm
        orgId={org.id}
        role={role}
        current={org.bar_settings ?? { tip_split_percent: 15, default_hourly_rate: 15 }}
      />
    </div>
  );
}
