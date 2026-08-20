import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getCurrentOrg } from '@/lib/org';
import DirectDepositTab from '../_components/direct-deposit-tab';
import { getAllDirectDepositAccounts } from '../direct-deposit-actions';
import { loadEmployees } from '../_shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Direct Deposit' };

/**
 * Bank details for paying staff.
 *
 * The accounts query only runs on this route now. It used to be behind a
 * ternary on the shared payroll page, which is the sort of conditional that
 * quietly stops matching its tab.
 */
export default async function DirectDepositPage() {
  const { org } = await getCurrentOrg();

  const [employees, accountsByEmployee] = await Promise.all([
    loadEmployees(),
    getAllDirectDepositAccounts(),
  ]);

  const adminPhone =
    (((org.bar_settings ?? {}) as Record<string, unknown>).admin_phone as string | null) ?? null;

  return (
    <div className="p-5 sm:p-6">
      <Suspense fallback={<div>Loading…</div>}>
        <DirectDepositTab
          employees={employees as never}
          accountsByEmployee={accountsByEmployee}
          adminPhone={adminPhone}
        />
      </Suspense>
    </div>
  );
}
