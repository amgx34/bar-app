'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, Sparkles, CheckCircle, RotateCcw, FileText, FileSpreadsheet } from 'lucide-react';
import { parseEmployeeShifts } from '@/lib/csv-parsers/parse-employee-shifts';
import { parseEmployeeWorkReport, isEmployeeWorkReport } from '@/lib/csv-parsers/parse-employee-work-report';
import { parseShiftsWithAI } from '@/lib/ai-parsers/parse-shifts-with-ai';
import { saveEmployeeShifts } from '../actions';
import type { ParsedEmployeeShift } from '@/lib/csv-parsers/parse-employee-shifts';

type DetectedFormat = 'text-report' | 'csv' | 'ai';
type State = 'idle' | 'parsing' | 'preview' | 'saving';

const FORMAT_BADGE: Record<DetectedFormat, { icon: React.ElementType; label: string; className: string }> = {
  'text-report': { icon: FileText,        label: 'Text Report', className: 'bg-primary/15 text-primary' },
  csv:           { icon: FileSpreadsheet, label: 'CSV',         className: 'bg-emerald-500/15 text-emerald-400' },
  ai:            { icon: Sparkles,        label: 'AI Parsed',   className: 'bg-violet-500/20 text-violet-300' },
};

export default function EmployeeShiftsUpload() {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedEmployeeShift[] | null>(null);
  const [format, setFormat] = useState<DetectedFormat | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setState('idle');
    setText('');
    setParsed(null);
    setFormat(null);
  }

  async function handleParse() {
    if (!text.trim()) { toast.error('Paste your employee report first'); return; }
    setState('parsing');

    let shifts: ParsedEmployeeShift[] | null = null;
    let fmt: DetectedFormat | null = null;

    // 1. Try text-report format
    if (isEmployeeWorkReport(text)) {
      try {
        const result = parseEmployeeWorkReport(text);
        if (result.length > 0) { shifts = result; fmt = 'text-report'; }
      } catch { /* fall through */ }
    }

    // 2. Try CSV format
    if (!shifts) {
      try {
        const result = await parseEmployeeShifts(text);
        if (result.length > 0) { shifts = result; fmt = 'csv'; }
      } catch { /* fall through */ }
    }

    // 3. Auto-fallback to AI
    if (!shifts) {
      try {
        const result = await parseShiftsWithAI(text);
        if (result.length > 0) { shifts = result; fmt = 'ai'; }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not parse employee report');
        setState('idle');
        return;
      }
    }

    if (!shifts || shifts.length === 0) {
      toast.error('No shifts found — check your data and try again');
      setState('idle');
      return;
    }

    setFormat(fmt);
    setParsed(shifts);
    setState('preview');
  }

  async function handleSave() {
    if (!parsed) return;
    setState('saving');
    try {
      const res = await saveEmployeeShifts(parsed);
      const parts = [`Imported ${res.totalSaved} shifts`];
      if (res.newEmployees.length > 0) {
        parts.push(`${res.newEmployees.length} new employee${res.newEmployees.length > 1 ? 's' : ''} created`);
      }
      toast.success(parts.join(' — '));
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import');
      setState('preview');
    }
  }

  const summary = parsed
    ? (() => {
        const names = new Set(parsed.map((s) => s.employeeName));
        const dates = parsed.map((s) => s.shiftDate).sort();
        return {
          employees: names.size,
          shifts: parsed.length,
          dateFrom: dates[0],
          dateTo: dates[dates.length - 1],
          sample: parsed.slice(0, 6),
        };
      })()
    : null;

  return (
    <div className="space-y-3">
      {state === 'idle' && (
        <>
          <Textarea
            placeholder={"Paste your Employee Worked Report or CSV here…\n\nSupports: POS text report, CSV (name, date, hours), or any shift export — AI fallback if format isn't recognised."}
            className="min-h-[180px] font-mono text-xs resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleParse} disabled={!text.trim()} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Parse
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.text"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setText(await file.text());
                e.target.value = '';
              }}
            />
            <span className="text-xs text-muted-foreground ml-auto">.txt · .csv</span>
          </div>
        </>
      )}

      {state === 'parsing' && (
        <div className="space-y-2 py-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            Parsing shifts…
          </p>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      )}

      {(state === 'preview' || state === 'saving') && parsed && summary && (() => {
        const badge = format ? FORMAT_BADGE[format] : null;
        const BadgeIcon = badge?.icon;
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-300">
                  {summary.shifts} shift{summary.shifts !== 1 ? 's' : ''}, {summary.employees} employees
                </p>
                <p className="text-xs text-emerald-400/80">
                  {summary.dateFrom} → {summary.dateTo}
                </p>
              </div>
              {badge && BadgeIcon && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs shrink-0 ${badge.className}`}>
                  <BadgeIcon className="h-3 w-3" />
                  {badge.label}
                </span>
              )}
            </div>

            <div className="rounded-lg border text-xs max-h-44 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Employee</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Hrs</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">OT</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.sample.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{s.employeeName}</td>
                      <td className="px-3 py-1.5 tabular-nums">{s.shiftDate}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{s.regularHours.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-400">
                        {s.overtimeHours > 0 ? s.overtimeHours.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                  {parsed.length > 6 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">
                        + {parsed.length - 6} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={state === 'saving'} className="flex-1">
                {state === 'saving' ? 'Importing…' : `Confirm & Import ${summary.shifts} shifts`}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} className="gap-1.5 text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
