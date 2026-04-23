import { getCurrentOrg } from '@/lib/org';

export default async function DashboardPage() {
  const { org, role } = await getCurrentOrg();

  return (
    <main className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as <span className="capitalize">{role}</span>.
        </p>
      </div>
      <p className="text-sm">Org ID: <code className="text-xs">{org.id}</code></p>
    </main>
  );
}