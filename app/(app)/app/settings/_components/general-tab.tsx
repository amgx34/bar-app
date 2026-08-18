'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { suggestTaxRate } from '@/lib/books/state-tax-rates';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { updateGeneralInfo } from '../actions';
import type { BarSettings } from '@/lib/org';
import type { Role } from '@/lib/permissions';

const BAR_TYPES = [
  { value: 'bar',         label: 'Bar / Tavern' },
  { value: 'nightclub',   label: 'Nightclub' },
  { value: 'restaurant',  label: 'Restaurant + Bar' },
  { value: 'brewery',     label: 'Brewery / Tap Room' },
  { value: 'hotel_bar',   label: 'Hotel Bar' },
  { value: 'sports_bar',  label: 'Sports Bar' },
  { value: 'other',       label: 'Other' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

interface Props {
  orgName:  string;
  role:     Role;
  settings: BarSettings;
}

export function GeneralTab({ orgName, role, settings }: Props) {
  const s = settings as Record<string, unknown>;
  const [form, setForm] = useState({
    bar_type:           settings.bar_type    ?? 'bar',
    bar_city:           settings.bar_city    ?? '',
    bar_state:          settings.bar_state   ?? '',
    bar_phone:          settings.bar_phone   ?? '',
    bar_address:        settings.bar_address ?? '',
    nacha_routing_number: (s.nacha_routing_number as string | undefined) ?? '',
    nacha_company_ein:    (s.nacha_company_ein    as string | undefined) ?? '',
    nacha_bank_name:      (s.nacha_bank_name      as string | undefined) ?? '',
    nacha_company_name:   (s.nacha_company_name   as string | undefined) ?? '',
    sales_tax_rate:         (s.sales_tax_rate as number | undefined) ?? 0,
    // Tri-state in the UI: '' means "not answered", which is what keeps the
    // books honest rather than defaulting to a guess.
    pos_prices_include_tax:
      typeof s.pos_prices_include_tax === 'boolean'
        ? (s.pos_prices_include_tax ? 'yes' : 'no')
        : '',
  });
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'owner' || role === 'manager';

  // Follows the state field as it is edited, so changing location updates the
  // hint without a save.
  const suggestion = suggestTaxRate(form.bar_state, form.bar_city);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateGeneralInfo({
        ...form,
        sales_tax_rate: Number(form.sales_tax_rate) || undefined,
        pos_prices_include_tax:
          form.pos_prices_include_tax === '' ? undefined : form.pos_prices_include_tax === 'yes',
      });
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Identity */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Bar Identity</h3>

        <div className="space-y-1.5">
          <Label>Bar Name</Label>
          <Input value={orgName} disabled className="bg-muted/50 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Contact support to change your bar name.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Venue Type</Label>
            <Select value={form.bar_type} onValueChange={(v) => setForm({ ...form, bar_type: v ?? 'bar' })} disabled={!canEdit}>
              <SelectTrigger>
                <span className="text-sm">{BAR_TYPES.find(b => b.value === form.bar_type)?.label ?? 'Bar / Tavern'}</span>
              </SelectTrigger>
              <SelectContent>
                {BAR_TYPES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1 (555) 000-0000" value={form.bar_phone}
              onChange={(e) => setForm({ ...form, bar_phone: e.target.value })}
              disabled={!canEdit} />
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Location</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input placeholder="Chicago" value={form.bar_city}
              onChange={(e) => setForm({ ...form, bar_city: e.target.value })}
              disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Select value={form.bar_state || 'none'} onValueChange={(v) => setForm({ ...form, bar_state: !v || v === 'none' ? '' : v })} disabled={!canEdit}>
              <SelectTrigger>
                <span className="text-sm">{form.bar_state || 'Select state'}</span>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="none">— None —</SelectItem>
                {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Street Address</Label>
          <Input placeholder="123 Main St" value={form.bar_address}
            onChange={(e) => setForm({ ...form, bar_address: e.target.value })}
            disabled={!canEdit} />
        </div>
      </div>

      {/* Sales tax — drives the profit split on the Books page. */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Sales Tax</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Sales tax is money you hold for the state, not income. Set these and the Books
            page separates it from profit. Leave them blank and Books shows your POS
            figures as-is rather than guessing — a wrong guess here would overstate what
            the bar actually keeps.
          </p>
        </div>

        {/* Suggested from the bar's state, and never applied on its own. The
            state BASE rate is not what a bar collects — local tax stacks on top,
            and in a city like Chicago the difference is four points. Filling it
            silently would put a plausible, wrong number into the books. */}
        {suggestion && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <p className="text-sm">
              <span className="font-medium">{suggestion.state} base rate: {suggestion.baseRate}%</span>
              <span className="text-muted-foreground"> — {suggestion.note}</span>
            </p>

            {suggestion.localExample && (
              <p className="text-xs text-muted-foreground">
                For scale: {suggestion.localExample.city} bars are around{' '}
                {suggestion.localExample.approx}% once county and city are included.
              </p>
            )}

            {suggestion.alcoholNote && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {suggestion.alcoholNote}
              </p>
            )}

            {canEdit && suggestion.baseRate > 0 && (
              <button
                type="button"
                onClick={() => setForm({ ...form, sales_tax_rate: suggestion.baseRate })}
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                Start from {suggestion.baseRate}% and add your local rate
              </button>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sales-tax-rate">Sales tax rate (%)</Label>
            <Input
              id="sales-tax-rate"
              type="number" min="0" max="25" step="0.001" inputMode="decimal"
              placeholder="8.25"
              disabled={!canEdit}
              value={form.sales_tax_rate || ''}
              onChange={(e) => setForm({ ...form, sales_tax_rate: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tax-included">Do your POS sales figures already include tax?</Label>
            <select
              id="tax-included"
              disabled={!canEdit}
              value={form.pos_prices_include_tax}
              onChange={(e) => setForm({ ...form, pos_prices_include_tax: e.target.value })}
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Not set — no split shown</option>
              <option value="yes">Yes — totals include tax</option>
              <option value="no">No — tax is added on top</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Check a Z report against a receipt if you are unsure. A POS
              &ldquo;net sales&rdquo; column usually means net of discounts, which does
              not tell you either way.
            </p>
          </div>
        </div>
      </div>

      {/* ACH / NACHA Payroll */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Payroll &amp; ACH Direct Deposit</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Used to generate NACHA files for direct deposit. Upload the file to your bank's
            business portal (Chase ACH Manager, BofA CashPro, etc.) — no third-party service needed.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bank Routing Number (ODFI) <span className="text-destructive">*</span></Label>
            <Input
              placeholder="021000021"
              maxLength={9}
              value={form.nacha_routing_number}
              onChange={(e) => setForm({ ...form, nacha_routing_number: e.target.value.replace(/\D/g, '') })}
              disabled={!canEdit}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Your business bank's 9-digit routing number</p>
          </div>
          <div className="space-y-1.5">
            <Label>Bank Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="JP Morgan Chase"
              value={form.nacha_bank_name}
              onChange={(e) => setForm({ ...form, nacha_bank_name: e.target.value })}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Company EIN <span className="text-destructive">*</span></Label>
            <Input
              placeholder="123456789"
              maxLength={9}
              value={form.nacha_company_ein}
              onChange={(e) => setForm({ ...form, nacha_company_ein: e.target.value.replace(/\D/g, '') })}
              disabled={!canEdit}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">9-digit EIN without dashes (e.g. 123456789)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Company Name on Payroll</Label>
            <Input
              placeholder="Demo Bar LLC"
              maxLength={16}
              value={form.nacha_company_name}
              onChange={(e) => setForm({ ...form, nacha_company_name: e.target.value })}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">Max 16 chars — shown on employee bank statements</p>
          </div>
        </div>
      </div>

      {canEdit && (
        <Button type="submit" disabled={saving} className="gap-2">
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      )}
    </form>
  );
}
