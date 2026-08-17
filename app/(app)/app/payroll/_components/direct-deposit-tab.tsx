'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Banknote, Phone, Plus, Trash2, CheckCircle,
  Clock, AlertTriangle, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { saveAdminPhone, exportBankingInfoCsv } from '../direct-deposit-actions';
import { DirectDepositDialog } from './direct-deposit-dialog';
import type { DDAccount } from '../direct-deposit-actions';
import type { Employee } from '../actions';

interface Props {
  employees: Employee[];
  accountsByEmployee: Record<string, DDAccount[]>;
  adminPhone: string | null;
}

export default function DirectDepositTab({ employees, accountsByEmployee, adminPhone }: Props) {
  const [phone, setPhone]         = useState(adminPhone ?? '');
  const [savingPhone, setSavingPhone] = useState(false);
  const [localPhone, setLocalPhone] = useState(adminPhone);

  // Dialog state
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [dialogMode, setDialogMode]   = useState<'add' | 'delete'>('add');
  const [targetEmployee, setTarget]   = useState<Employee | null>(null);
  const [targetAccount, setTargetAcct] = useState<DDAccount | null>(null);

  // Local account cache so UI updates without full page reload
  const [accounts,     setAccounts]     = useState(accountsByEmployee);
  const [exporting,    setExporting]    = useState(false);

  const EXCLUDED = new Set(['front door']);
  const eligibleEmployees = employees.filter(e => !EXCLUDED.has(e.name.toLowerCase()));

  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    setSavingPhone(true);
    try {
      await saveAdminPhone(phone);
      setLocalPhone(phone);
      toast.success('Phone number saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save phone');
    } finally {
      setSavingPhone(false);
    }
  }

  function openAdd(emp: Employee) {
    setTarget(emp);
    setTargetAcct(null);
    setDialogMode('add');
    setDialogOpen(true);
  }

  function openDelete(emp: Employee, acct: DDAccount) {
    setTarget(emp);
    setTargetAcct(acct);
    setDialogMode('delete');
    setDialogOpen(true);
  }

  function handleSuccess(newAccount?: DDAccount) {
    if (!targetEmployee) return;
    if (dialogMode === 'delete' && targetAccount) {
      setAccounts(prev => ({
        ...prev,
        [targetEmployee.id]: (prev[targetEmployee.id] ?? []).filter(a => a.id !== targetAccount.id),
      }));
    } else if (newAccount) {
      setAccounts(prev => ({
        ...prev,
        [targetEmployee.id]: [
          ...(prev[targetEmployee.id] ?? []).filter(a => a.priority !== newAccount.priority),
          newAccount,
        ].sort((a, b) => a.priority - b.priority),
      }));
    }
    setDialogOpen(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportBankingInfoCsv();
      if (!csv) { toast.error('No banking records to export.'); return; }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `banking-info-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Banking info exported — provide this file to your payroll provider.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Liability disclaimer — must be the first thing the user sees ── */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-5 py-4 space-y-2">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Important — Rail does not process payroll payments
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">
          This tool <strong>securely stores</strong> employee banking information only. Rail is not a
          payroll processor, payment processor, or financial institution. Rail does not initiate,
          originate, or guarantee any ACH direct deposit transactions.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">
          To pay employees via direct deposit, you must provide this information to your{' '}
          <strong>bank, payroll provider (Gusto, ADP, Paychex, etc.), or accountant</strong> who
          is licensed to originate ACH transactions. Use the <em>Export for Payroll Provider</em>{' '}
          button below to download the data in a standard format.
        </p>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
          <p className="font-semibold text-foreground text-sm">Bank-grade security · SMS 2-factor verification required</p>
          <p>Every change requires a 6-digit SMS code. Account numbers are AES-256 encrypted. A full audit trail is maintained for every addition or removal.</p>
        </div>
      </div>

      {/* Phone setup */}
      {!localPhone ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            <p className="text-sm font-semibold text-amber-300">Phone number required</p>
          </div>
          <p className="text-xs text-amber-300/70 leading-relaxed">
            A phone number is needed to receive SMS verification codes before any direct deposit change is committed.
          </p>
          <form onSubmit={handleSavePhone} className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Your mobile number (E.164 format)</Label>
              <Input
                required placeholder="+15555550100" value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm" disabled={savingPhone} className="h-9">
                {savingPhone ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" />
            SMS codes sent to <strong>••••{localPhone.slice(-4)}</strong>
          </div>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setLocalPhone(null)}
          >
            Change phone
          </button>
        </div>
      )}

      {/* Employee list */}
      {localPhone && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              Employee Banking Information
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{eligibleEmployees.length} employees</span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
                className="h-7 text-xs gap-1.5"
              >
                {exporting ? 'Exporting…' : 'Export for Payroll Provider'}
              </Button>
            </div>
          </div>

          {eligibleEmployees.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No employees yet — add them in the Employees tab first.
            </div>
          ) : (
            <div className="divide-y">
              {eligibleEmployees.map(emp => {
                const empAccounts = accounts[emp.id] ?? [];
                const hasAccount  = empAccounts.length > 0;
                const primary     = empAccounts.find(a => a.priority === 1);

                return (
                  <div key={emp.id} className="px-5 py-4 flex flex-wrap items-start gap-4">
                    {/* Employee info */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium text-sm">{emp.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{emp.role ?? 'No role'}</p>
                    </div>

                    {/* Account status */}
                    <div className="flex-1 min-w-[200px] space-y-1.5">
                      {!hasAccount ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                          No direct deposit on file
                        </span>
                      ) : (
                        empAccounts.map(acct => (
                          <div key={acct.id} className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">
                              {acct.bank_name} ••••{acct.account_last4}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 capitalize">
                              {acct.account_type}
                            </Badge>
                            {acct.deposit_type !== 'full' && (
                              <Badge variant="outline" className="text-[10px] py-0">
                                {acct.deposit_type === 'percentage'
                                  ? `${acct.deposit_value}%`
                                  : `$${((acct.deposit_value ?? 0) / 100).toFixed(2)}`}
                              </Badge>
                            )}
                            {acct.prenote_sent_at ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                                <CheckCircle className="h-3 w-3" /> Recorded
                              </span>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!hasAccount ? (
                        <Button size="sm" onClick={() => openAdd(emp)} className="h-8 gap-1.5 text-xs">
                          <Plus className="h-3.5 w-3.5" /> Set Up
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openAdd(emp)} className="h-8 text-xs">
                            Update
                          </Button>
                          {primary && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => openDelete(emp, primary)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dialog */}
      {targetEmployee && (
        <DirectDepositDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          employeeId={targetEmployee.id}
          employeeName={targetEmployee.name}
          existingAccount={targetAccount}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
