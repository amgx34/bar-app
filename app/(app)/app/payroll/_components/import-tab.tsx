'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmployeeShiftsUpload from './employee-shifts-upload';
import ZReportTextUpload from './z-report-text-upload';
import CSVUpload from './csv-upload';
import { FileSpreadsheet, BarChart2, FileText } from 'lucide-react';

export default function ImportTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import Data</h2>
        <p className="text-sm text-muted-foreground">
          Upload your POS exports. New employees are created automatically.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
