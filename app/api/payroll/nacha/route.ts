/**
 * GET /api/payroll/nacha?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Generates a NACHA ACH file the bar owner uploads to their bank's
 * business portal to process payroll direct deposits.
 *
 * Security:
 *   - Requires authenticated session (owner only)
 *   - Decrypts routing/account numbers in-memory, never logged or persisted
 *   - Audit log entry written for every export
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@/lib/supabase/server';
import { createAdminClient }         from '@/lib/supabase/admin';
import { getCurrentOrg }             from '@/lib/org';
import { computePayroll }            from '@/app/(app)/app/payroll/actions';
import { getPayrollRun }             from '@/app/(app)/app/payroll/approval-actions';
import { decrypt }                   from '@/lib/direct-deposit/crypto';
import { generateNachaFile }         from '@/lib/payroll/nacha';
import type { NachaEntry, NachaConfig } from '@/lib/payroll/nacha';

export const runtime    = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') {
    return new Response('Only account owners can generate payroll files', { status: 403 });
  }

  // ── Date range ───────────────────────────────────────────────────────────────
  const url       = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate   = url.searchParams.get('endDate');
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  // ── NACHA settings ───────────────────────────────────────────────────────────
  const bs = (org.bar_settings ?? {}) as Record<string, unknown>;
  const odfiRouting = bs.nacha_routing_number as string | undefined;
  const companyEin  = bs.nacha_company_ein    as string | undefined;

  if (!odfiRouting || !companyEin) {
    return NextResponse.json({
      error: 'NACHA not configured',
      detail: 'Add your bank routing number and company EIN in Settings → General → Payroll & ACH.',
    }, { status: 422 });
  }

  const nachaConfig: NachaConfig = {
    odfiRouting,
    odfiName:    (bs.nacha_bank_name    as string | undefined) ?? 'YOUR BANK',
    companyName: (bs.nacha_company_name as string | undefined) ?? org.name,
    companyEin,
  };

  // ── Approval gate ────────────────────────────────────────────────────────────
  // Money must not move on numbers nobody reviewed. The gate is escapable —
  // overrideApprovalGate() records an owner's reason and marks the period
  // approved — because a bug in this workflow must never stop a bar making
  // payroll. It just cannot be escaped silently.
  const approvalRun = await getPayrollRun(startDate, endDate);
  if (approvalRun?.status !== 'approved') {
    return NextResponse.json({
      error: 'Payroll not approved',
      detail: approvalRun
        ? `This period is ${approvalRun.status === 'changes_requested' ? 'awaiting changes' : 'awaiting approval'}. Approve it in Payroll → Review before exporting ACH.`
        : 'Submit and approve this pay period in Payroll → Review before exporting ACH.',
      status: approvalRun?.status ?? 'not_submitted',
    }, { status: 409 });
  }

  // ── Payroll entries ──────────────────────────────────────────────────────────
  const payrollEntries = await computePayroll(startDate, endDate);
  if (!payrollEntries.length) {
    return NextResponse.json({ error: 'No payroll entries for this period' }, { status: 404 });
  }

  const employeeIds = payrollEntries.map(e => e.employeeId);

  // ── Direct deposit accounts ──────────────────────────────────────────────────
  const admin = createAdminClient();
  const { data: ddRows } = await admin
    .from('direct_deposit_accounts')
    .select('employee_id, routing_encrypted, account_encrypted, account_type, deposit_type, deposit_value, priority')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .in('employee_id', employeeIds)
    .order('priority');

  // Group by employee, sorted by priority
  const ddByEmployee = new Map<string, typeof ddRows>();
  for (const row of ddRows ?? []) {
    const list = ddByEmployee.get(row.employee_id) ?? [];
    list.push(row);
    ddByEmployee.set(row.employee_id, list);
  }

  // ── Build NACHA entries ──────────────────────────────────────────────────────
  // Routing + account numbers decrypted here, used only in-memory, never returned in response.
  const nachaEntries: NachaEntry[]  = [];
  const skipped:      string[]      = [];

  for (const entry of payrollEntries) {
    const accounts = ddByEmployee.get(entry.employeeId);
    if (!accounts?.length) {
      skipped.push(entry.employeeName);
      continue;
    }

    // Handle split deposits:
    // Accounts sorted by priority. Last account (highest priority number) gets remainder.
    let remaining = entry.totalCompensation;

    for (let i = 0; i < accounts.length; i++) {
      const acct   = accounts[i];
      const isLast = i === accounts.length - 1;
      let amount: number;

      if (isLast || acct.deposit_type === 'full') {
        amount = remaining;
      } else if (acct.deposit_type === 'fixed_amount' && acct.deposit_value) {
        amount = Math.min(acct.deposit_value, remaining);
      } else if (acct.deposit_type === 'percentage' && acct.deposit_value) {
        amount = Math.round((entry.totalCompensation * acct.deposit_value / 100) * 100) / 100;
      } else {
        amount = remaining;
      }

      if (amount <= 0) continue;

      nachaEntries.push({
        employeeName:  entry.employeeName,
        employeeId:    entry.employeeId.slice(0, 15),
        routingNumber: decrypt(acct.routing_encrypted),
        accountNumber: decrypt(acct.account_encrypted),
        accountType:   acct.account_type as 'checking' | 'savings',
        amount:        Math.round(amount * 100) / 100,
      });

      remaining = Math.max(0, Math.round((remaining - amount) * 100) / 100);
      if (remaining <= 0) break;
    }
  }

  if (!nachaEntries.length) {
    return NextResponse.json({
      error: 'No employees have direct deposit configured',
      skipped,
    }, { status: 422 });
  }

  // ── Generate file ─────────────────────────────────────────────────────────────
  let result;
  try {
    result = generateNachaFile(nachaConfig, nachaEntries);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 });
  }

  // ── Audit log ─────────────────────────────────────────────────────────────────
  await admin.from('dd_audit_log').insert({
    organization_id: org.id,
    employee_id:     org.id,
    action:          'NACHA_FILE_GENERATED',
    after_state:     {
      period_start:    startDate,
      period_end:      endDate,
      entry_count:     result.entryCount,
      total_amount:    result.totalAmount,
      effective_date:  result.effectiveDate,
      skipped_count:   skipped.length,
      generated_by:    user.email,
    },
  });

  // ── Return as downloadable file ───────────────────────────────────────────────
  const filename = `payroll-ach-${startDate}-to-${endDate}.ach`;
  return new Response(result.content, {
    headers: {
      'Content-Type':        'text/plain; charset=us-ascii',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-NACHA-Entries':     String(result.entryCount),
      'X-NACHA-Total':       result.totalAmount.toFixed(2),
      'X-Skipped-Employees': skipped.join(', '),
    },
  });
}
