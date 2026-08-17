'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EmployeeShiftsUpload from './employee-shifts-upload';
import ZReportTextUpload from './z-report-text-upload';
import CSVUpload from './csv-upload';
import { FileSpreadsheet, BarChart2, FileText, Flame, RefreshCw, Users, Package, Settings } from 'lucide-react';
import Link from 'next/link';
import { syncToastSales, syncToastInventory, syncToastShifts } from '../../settings/actions';

interface ImportTabProps {
  posProvider?: 'clover' | 'toast' | '2touch' | null;
}

function ToastSyncPanel() {
  const [, startTransition]  = useTransition();
  const [syncingSales,   setSyncingSales]   = useState(false);
  const [syncingInv,     setSyncingInv]     = useState(false);
  const [syncingShifts,  setSyncingShifts]  = useState(false);

  async function run<T>(
    setter: (v: boolean) => void,
    action: () => Promise<T>,
    onSuccess: (r: T) => string,
  ) {
    setter(true);
    try {
      const r = await action();
      toast.success(onSuccess(r));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setter(false);
    }
  }

  return (
    <Card className="border-orange-500/30 bg-orange-500/5 md:col-span-2 lg:col-span-3">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15">
              <Flame className="h-4 w-4 text-orange-700 dark:text-orange-300" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Toast POS Sync
                <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-600 dark:border-orange-400/30 text-[10px]">Connected</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Pull live data directly from your Toast account
              </CardDescription>
            </div>
          </div>
          <Link href="/app/settings?tab=pos" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <Settings className="h-3 w-3" /> Manage connection
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-3">
          <button
            disabled={syncingSales || syncingInv || syncingShifts}
            onClick={() => run(setSyncingSales, () => syncToastSales(14), (r) => `${(r as {upserted:number}).upserted} days of sales synced`)}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 w-full">
              <RefreshCw className={`h-4 w-4 text-orange-700 dark:text-orange-300 ${syncingSales ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">{syncingSales ? 'Syncing…' : 'Sync Sales'}</span>
            </div>
            <p className="text-xs text-muted-foreground">Last 14 nights of orders → Dashboard &amp; Books</p>
          </button>

          <button
            disabled={syncingSales || syncingInv || syncingShifts}
            onClick={() => run(setSyncingInv, () => syncToastInventory(), (r) => { const res = r as {created:number;updated:number}; return `${res.created} created, ${res.updated} updated`; })}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 w-full">
              <Package className={`h-4 w-4 text-orange-700 dark:text-orange-300 ${syncingInv ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">{syncingInv ? 'Syncing…' : 'Sync Menu'}</span>
            </div>
            <p className="text-xs text-muted-foreground">Import Toast menu items → Inventory</p>
          </button>

          <button
            disabled={syncingSales || syncingInv || syncingShifts}
            onClick={() => run(setSyncingShifts, () => syncToastShifts(14), (r) => { const res = r as {upserted:number;newEmployees:number}; return `${res.upserted} shifts, ${res.newEmployees} new employees`; })}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 w-full">
              <Users className={`h-4 w-4 text-orange-700 dark:text-orange-300 ${syncingShifts ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">{syncingShifts ? 'Syncing…' : 'Sync Shifts'}</span>
            </div>
            <p className="text-xs text-muted-foreground">Last 14 days of labor → Payroll</p>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ImportTab({ posProvider }: ImportTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import Data</h2>
        <p className="text-sm text-muted-foreground">
          {posProvider === 'toast'
            ? 'Sync live data from Toast, or manually upload POS exports below.'
            : 'Upload your POS exports. New employees are created automatically.'}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Toast live sync — shown only when connected */}
        {posProvider === 'toast' && <ToastSyncPanel />}
        {/* Employee shifts — auto-detects CSV or text report */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Employee Worked Reports</CardTitle>
                <CardDescription className="text-xs">
                  CSV export or text Employee Worked Report (.txt) — auto-detected
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <EmployeeShiftsUpload />
          </CardContent>
        </Card>

        {/* Z Report text (primary) */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Daily Z Report</CardTitle>
                <CardDescription className="text-xs">
                  Full Z report (.txt) — captures individual server tips &amp; sales
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ZReportTextUpload />
          </CardContent>
        </Card>

        {/* Z Report CSV (fallback) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base text-muted-foreground">
                  Z Report (CSV fallback)
                </CardTitle>
                <CardDescription className="text-xs">
                  Aggregate totals only — no per-server data
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CSVUpload reportType="z-reports" />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Format Reference</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="font-medium mb-1.5">Employee Worked Reports</p>
            <p className="text-xs text-muted-foreground mb-1">Text (.txt) — auto-detected:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside mb-2">
              <li>Full text export from POS</li>
              <li>All employees in one file</li>
              <li>Front Door excluded automatically</li>
            </ul>
            <p className="text-xs text-muted-foreground mb-1">CSV fallback:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Employee Name, Date, Regular Hours, Overtime Hours</li>
              <li>Hourly Rate <span className="text-xs">(optional)</span></li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1.5">Daily Z Report (.txt)</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Full text export from POS</li>
              <li>Captures total sales &amp; tips</li>
              <li>Individual server tips</li>
              <li>Per-server sales (for Sales %)</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1.5">Z Report CSV (fallback)</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Date</li>
              <li>Total Sales</li>
              <li>Cash Tips</li>
              <li>Credit Card Tips</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
