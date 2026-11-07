'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { saveOrgTaxConfig } from '../tax-settings-actions';
import type { OrgTaxConfig, PayFrequency } from '@/lib/payroll/tax/types';
import type { TablesStatus } from '@/lib/payroll/tax/ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

const FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
};

interface TaxSetupPanelProps {
  initial: OrgTaxConfig;
  /** Resolved on the server: tablesFor() throws and must not run in render here. */
  tables: TablesStatus;
  /** Has the owner ever picked a pay frequency? Until then the Select shows a prompt, not the 'biweekly' fill-in. */
  frequencyChosen: boolean;
}

export default function TaxSetupPanel({ initial, tables, frequencyChosen }: TaxSetupPanelProps) {
  const [config, setConfig] = useState<OrgTaxConfig>(initial);
  const [rate, setRate] = useState(String(initial.stateRate));
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState(frequencyChosen);

  // Turning tax ON is refused while the tables are not real. Turning it off is
  // always allowed, so a bar that enabled it earlier can still back out.
  const cannotEnable = (!tables.usable || !chosen) && !config.enabled;

  const save = async (patch: Partial<OrgTaxConfig>) => {
    setSaving(true);
    try {
      await saveOrgTaxConfig(patch);
      setConfig((c) => ({ ...c, ...patch }));
      if (patch.payFrequency !== undefined) setChosen(true);
      toast.success('Tax setup saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save tax setup');
    } finally {
      setSaving(false);
    }
  };

  const saveRate = () => {
    const n = Number(rate);
    if (rate.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('State rate must be a percentage from 0 to 100');
      return;
    }
    void save({ stateRate: n });
  };

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 className="text-sm font-semibold">Tax setup</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Rail calculates withholding. It does not file returns, remit deposits, or produce W-2s.
        </p>
      </div>

      {!tables.usable && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{tables.message}</p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.enabled}
          disabled={saving || cannotEnable}
          onChange={(e) => save({ enabled: e.target.checked })}
        />
        Withhold taxes from pay
      </label>
      {cannotEnable && (
        <p className="text-xs text-muted-foreground">
          {!tables.usable
            ? 'Withholding cannot be switched on until real tax tables are in place.'
            : 'Choose how often you pay before switching withholding on.'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="taxPayFrequency">Pay frequency</Label>
          <Select
            value={chosen ? config.payFrequency : ''}
            onValueChange={(v) => save({ payFrequency: v as PayFrequency })}
          >
            <SelectTrigger id="taxPayFrequency" disabled={saving}>
              <SelectValue placeholder="Choose how often you pay" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FREQUENCY_LABELS) as PayFrequency[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>How do tips reach your staff?</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="taxTipsPaid"
              checked={!config.tipsPaidOnCheque}
              disabled={saving}
              onChange={() => save({ tipsPaidOnCheque: false })}
            />
            Tips are cashed out nightly
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="taxTipsPaid"
              checked={config.tipsPaidOnCheque}
              disabled={saving}
              onChange={() => save({ tipsPaidOnCheque: true })}
            />
            Tips are paid out on paychecks
          </label>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.stateEnabled}
              disabled={saving}
              onChange={(e) => save({ stateEnabled: e.target.checked })}
            />
            Withhold state income tax
          </label>
          <Label htmlFor="taxStateRate">Flat state rate (estimate)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="taxStateRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="max-w-28"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving || Number(rate) === config.stateRate}
              onClick={saveRate}
            >
              Save rate
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
