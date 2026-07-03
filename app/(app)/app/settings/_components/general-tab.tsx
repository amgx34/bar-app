'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
  });
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'owner' || role === 'manager';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateGeneralInfo(form);
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
