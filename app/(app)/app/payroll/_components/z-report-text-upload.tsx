'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, Sparkles, CheckCircle, RotateCcw } from 'lucide-react';
import { parseZReportText } from '@/lib/csv-parsers/parse-z-report-text';
import { parseZReportWithAI } from '@/lib/ai-parsers/parse-z-report-with-ai';
import { saveZReportText } from '../actions';
import type { ParsedZReportText } from '@/lib/csv-parsers/parse-z-report-text';

type State = 'idle' | 'parsing' | 'preview' | 'saving';

export default function ZReportTextUpload() {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedZReportText | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setState('idle');
    setText('');
    setParsed(null);
    setUsedAI(false);
  }

  async function handleParse() {
    if (!text.trim()) { toast.error('Paste your Z report text first'); return; }
    setState('parsing');

    let result: ParsedZReportText | null = null;
    let ai = false;

    // Try deterministic parser first
    let deterministicError: string | null = null;
    try {
      result = parseZReportText(text);
    } catch (err) {
      deterministicError = err instanceof Error ? err.message : null;
      /* fall through to AI */
    }

    // Auto-fallback to AI if deterministic failed
    if (!result) {
      try {
        result = await parseZReportWithAI(text);
        ai = true;
      } catch (err) {
        // The pasted text is deliberately left in place. Losing a Z report
        // someone retyped at 3am because a third-party service was down is a
        // worse outcome than the failed import itself.
        const message = err instanceof Error ? err.message : 'Could not read this Z report';
        toast.error(message, {
          description: deterministicError
            ? `Direct read also failed: ${deterministicError}`
            : undefined,
          duration: 8000,
        });
        setState('idle');
        return;
      }
    }

    setUsedAI(ai);
    setParsed(result);
    setState('preview');
  }

  async function handleSave() {
    if (!parsed) return;
    setState('saving');
    try {
      const res = await saveZReportText(parsed);
      toast.success(`Saved Z report for ${res.reportDate} — ${res.serverCount} servers`);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      setState('preview');
    }
  }

  return (
    <div className="space-y-3">
      {state === 'idle' && (
        <>
          <Textarea
            placeholder={"Paste your full Z report text here…\n\nAny POS format is supported — text is parsed automatically, with AI as fallback."}
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
              accept=".txt,.text,.csv"
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
            Parsing report…
          </p>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      )}

      {(state === 'preview' || state === 'saving') && parsed && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-700 dark:text-emerald-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-300">{parsed.reportDate}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300/80">
                ${parsed.totalSales.toFixed(2)} sales · ${parsed.totalTips.toFixed(2)} tips · {parsed.serverData.length} servers
              </p>
            </div>
            {usedAI && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300 shrink-0">
                <Sparkles className="h-3 w-3" />
                AI
              </span>
            )}
          </div>

          {parsed.serverData.length > 0 && (
            <div className="rounded-lg border text-xs max-h-44 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Server</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sales</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tips</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.serverData.map((s) => (
                    <tr key={s.name}>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${s.totalSales.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${s.tipsPaidOut.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={state === 'saving'} className="flex-1">
              {state === 'saving' ? 'Saving…' : 'Confirm & Import'}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
