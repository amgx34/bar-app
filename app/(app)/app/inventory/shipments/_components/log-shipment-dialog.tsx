'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Check, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  parseShipmentText, postShipment,
  type ShipmentReviewHeader, type ShipmentReviewLine,
} from '../../shipment-actions';
import { flagPriceChanges, reconcileTotal, type PriceChange } from '@/lib/inventory/shipments';
import { hasPack } from '@/lib/inventory/packs';
import { togglePackLine } from '@/lib/inventory/pack-line';

const UNITS = ['bottle', 'can', 'keg', 'case', 'each', 'oz', 'liter', 'bag', 'box', 'gallon', 'jar'];

type DialogState = 'idle' | 'parsing' | 'review' | 'importing' | 'done';

/**
 * The header fields as this form edits them: every AI-nullable field gets a
 * concrete default the moment it lands in state (empty string / 0), because
 * <input> needs a defined value to stay controlled. `invoiceTotal` is the one
 * exception — null there means "no total to check", a real state the
 * reconciliation line below has to be able to tell apart from "$0 invoice".
 */
type HeaderState = {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  freight: number;
  tax: number;
  deposits: number;
  otherCharges: number;
  invoiceTotal: number | null;
};

/**
 * A review line plus the one thing the review screen adds: which unit cost,
 * if any, a human has actually signed off on.
 *
 * Deliberately NOT a boolean. A boolean records "yes, apply the cost" with no
 * memory of WHICH cost it was approving — so editing the price after ticking
 * the box leaves the tick standing over a number nobody looked at. Storing
 * the approved figure itself makes that impossible: the approval is for a
 * specific price, and it stops matching the moment the price changes out
 * from under it. `null` means nothing has been approved yet.
 */
interface EditableLine extends ShipmentReviewLine {
  approvedCost: number | null;
  /**
   * Whether the operator has expanded this line's quantity from packs into
   * singles. Tracked so the control is a TOGGLE: a plain "convert" button
   * tapped twice would turn 5 cases into 2,880 cans, and the delivery would
   * post before anyone noticed.
   */
  packApplied: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const EMPTY_HEADER: HeaderState = {
  vendorName: '',
  invoiceNumber: '',
  invoiceDate: '',
  freight: 0,
  tax: 0,
  deposits: 0,
  otherCharges: 0,
  invoiceTotal: null,
};

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function headerFromReview(h: ShipmentReviewHeader): HeaderState {
  return {
    vendorName: h.vendorName ?? '',
    invoiceNumber: h.invoiceNumber ?? '',
    invoiceDate: h.invoiceDate ?? '',
    freight: h.freight ?? 0,
    tax: h.tax ?? 0,
    deposits: h.deposits ?? 0,
    otherCharges: h.otherCharges ?? 0,
    invoiceTotal: h.invoiceTotal ?? null,
  };
}

/** Bridges the review line's field names into flagPriceChanges' shape — see the brief for why these differ. */
function computePriceChanges(lines: Array<{ existingId: string | null; quantity: number; unitCost: number | null; currentCost: number | null }>) {
  return flagPriceChanges(
    lines.map((l) => ({ itemId: l.existingId, quantity: l.quantity, unitCost: l.unitCost })),
    new Map(
      lines
        .filter((l) => l.existingId && l.currentCost != null)
        .map((l) => [l.existingId as string, l.currentCost as number]),
    ),
  );
}

/**
 * Whether this line's cost price should actually move if the shipment posts.
 *
 * A line that is not currently flagged applies automatically — either it was
 * never risky, or it started flagged and was hand-corrected back under the
 * threshold, in which case the (now stale) approval is irrelevant because
 * nothing needs confirming any more. A line that IS still flagged applies
 * only when `approvedCost` equals its CURRENT `unitCost` — i.e. a human
 * ticked the box for this exact number, not some earlier one that has since
 * been edited again.
 */
function effectiveApplyCost(line: EditableLine, changes: Map<string, PriceChange>): boolean {
  return !isLineUnresolved(line, changes);
}

/**
 * The single source of truth for "this line is still blocking the post."
 * Used both to compute `canPost` and to word the footer's warning message —
 * kept as one function specifically so those two things cannot drift apart
 * and disagree about which lines are actually unresolved.
 */
function isLineUnresolved(line: EditableLine, changes: Map<string, PriceChange>): boolean {
  if (!line.existingId) return false;
  const change = changes.get(line.existingId);
  if (!change?.needsConfirm) return false;
  return line.approvedCost !== line.unitCost;
}

function linesFromReview(lines: ShipmentReviewLine[]): EditableLine[] {
  // No line starts approved — a fresh parse has had no human look at it yet,
  // flagged or not. Unflagged lines apply anyway (see effectiveApplyCost);
  // flagged lines wait for a tick.
  return lines.map((l) => ({ ...l, approvedCost: null, packApplied: false }));
}

/**
 * Paste an invoice, review what the AI read off it, post it.
 *
 * Mirrors ../../_components/inventory-import-dialog.tsx's state machine
 * (idle -> parsing -> review -> importing -> done) deliberately — same job,
 * same shape, so there is one pattern in this codebase for "AI suggests, a
 * human edits, a server action commits" instead of two. The review step here
 * carries extra weight that plain inventory import does not: posting a
 * shipment moves stock AND can reprice items, so it adds the price-change
 * guard and the invoice reconciliation line that inventory import has no
 * need for.
 */
export function LogShipmentDialog({ open, onOpenChange }: Props) {
  const [state, setState] = useState<DialogState>('idle');
  const [text, setText] = useState('');
  const [header, setHeader] = useState<HeaderState>(EMPTY_HEADER);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [result, setResult] = useState<{ shipmentId: string; linesPosted: number } | null>(null);

  function reset() {
    setState('idle');
    setText('');
    setHeader(EMPTY_HEADER);
    setLines([]);
    setResult(null);
  }

  function handleClose(v: boolean) {
    // Base UI dismisses this dialog on Escape and on an overlay click by
    // default, same as every close affordance (the X button, "Start over"
    // does not go through here). None of those must be allowed to interrupt
    // an in-flight post: the request is still running, and letting the
    // dialog close and reopen for a second invoice means the FIRST call's
    // setResult/setState('done') can land on the second one's screen —
    // a "done" summary for the wrong shipment. Refusing to close is more
    // honest than closing and discarding a result that is still coming.
    if (!v && state === 'importing') return;
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleParse() {
    if (!text.trim()) { toast.error('Paste an invoice first'); return; }
    setState('parsing');
    try {
      const parsed = await parseShipmentText(text);
      if (parsed.lines.length === 0) {
        toast.error('No line items found — try rephrasing or check your data');
        setState('idle');
        return;
      }
      setHeader(headerFromReview(parsed.header));
      setLines(linesFromReview(parsed.lines));
      setState('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Parse failed');
      setState('idle');
    }
  }

  function updateHeader<K extends keyof HeaderState>(field: K, value: HeaderState[K]) {
    setHeader((prev) => ({ ...prev, [field]: value }));
  }

  function updateLine<K extends keyof EditableLine>(index: number, field: K, value: EditableLine[K]) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  /**
   * Expand a line from packs into singles, or fold it back.
   *
   * Never automatic. An invoice quantity of "5" against an item with a pack
   * size of 24 is genuinely ambiguous — five cases or five loose cans — and
   * inventory_items.current_stock is in singles, so guessing wrong is a 24x
   * error in the stock a bar thinks it has. The operator reads the invoice and
   * decides; the resulting figure is shown before anything posts.
   */
  function togglePack(index: number) {
    setLines((prev) => prev.map((l, i) => (i === index ? togglePackLine(l) : l)));
  }

  /**
   * Ticking the box approves the CURRENT unit cost, not "yes forever" — see
   * the comment on `EditableLine.approvedCost`. Unticking clears it back to
   * null rather than to some other sentinel, so `effectiveApplyCost`'s
   * `approvedCost === unitCost` check has exactly one way to read "approved".
   */
  function toggleApproval(index: number, checked: boolean) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, approvedCost: checked ? l.unitCost : null } : l)));
  }

  // Recomputed from current line state on every render rather than stored —
  // it must never go stale relative to an edit the operator just made to
  // quantity or unit cost. Cheap: this dialog handles one invoice at a time.
  const priceChanges = useMemo(() => computePriceChanges(lines), [lines]);

  const reconciliation = useMemo(
    () =>
      reconcileTotal(
        lines.map((l) => ({ lineTotal: l.quantity * (l.unitCost ?? 0) })),
        { freight: header.freight, tax: header.tax, otherCharges: header.otherCharges, deposits: header.deposits },
        header.invoiceTotal,
      ),
    [lines, header.freight, header.tax, header.otherCharges, header.deposits, header.invoiceTotal],
  );

  // The guard against a misread digit silently repricing the bar: any line
  // still flagged AND not approved for its CURRENT unit cost blocks the Post
  // button outright — see isLineUnresolved for why "approved" means
  // approvedCost === unitCost rather than a plain sticky boolean.
  const unresolvedPriceChanges = lines.some((l) => isLineUnresolved(l, priceChanges));

  /**
   * A line that would post with $0.00 of value nobody can see coming: a
   * cleared/zeroed quantity, a negative quantity, or an unreadable/negative
   * unit cost. `null` unit cost stays legal on purpose — a genuinely free
   * case is real (Task 6 values it at $0 rather than falling back to the
   * stored cost), so only a NUMBER that is negative or non-finite is wrong.
   * Checked client-side so a bad field blocks the Post button with a named
   * cause, instead of round-tripping to postShipment's zod and bouncing back
   * as a raw server error.
   */
  function lineError(l: EditableLine): string | null {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) return 'needs a quantity greater than 0';
    if (l.unitCost !== null && (!Number.isFinite(l.unitCost) || l.unitCost < 0)) return 'needs a valid unit cost';
    return null;
  }

  const firstInvalidLine = lines.find((l) => lineError(l) !== null) ?? null;

  const canPost =
    header.vendorName.trim() !== '' &&
    header.invoiceDate.trim() !== '' &&
    lines.length > 0 &&
    !unresolvedPriceChanges &&
    firstInvalidLine === null;

  async function handlePost() {
    // Caught here, in the form, rather than left to surface as postShipment's
    // zod error — the brief is explicit that a missing vendor or invoice date
    // must never reach the server round trip only to bounce back as a raw
    // validation message.
    if (header.vendorName.trim() === '') { toast.error('Vendor is required'); return; }
    if (header.invoiceDate.trim() === '') { toast.error('Invoice date is required'); return; }
    if (lines.length === 0) { toast.error('This shipment has no lines'); return; }
    if (firstInvalidLine) { toast.error(`"${firstInvalidLine.name}" ${lineError(firstInvalidLine)}`); return; }
    if (unresolvedPriceChanges) { toast.error('Confirm or correct the flagged price changes before posting'); return; }

    setState('importing');
    try {
      const res = await postShipment({
        vendorName: header.vendorName.trim(),
        repId: null,
        invoiceNumber: header.invoiceNumber.trim() || null,
        invoiceDate: header.invoiceDate,
        receivedDate: null,
        freight: header.freight,
        tax: header.tax,
        deposits: header.deposits,
        otherCharges: header.otherCharges,
        invoiceTotal: header.invoiceTotal,
        notes: null,
        source: 'ai_paste',
        lines: lines.map((l) => ({
          existingId: l.existingId,
          name: l.name,
          quantity: l.quantity,
          unit: l.unit,
          unitCost: l.unitCost,
          category: l.category,
          sku: l.sku,
          applyCost: effectiveApplyCost(l, priceChanges),
        })),
      });
      setResult(res);
      setState('done');
      toast.success(`Posted ${res.linesPosted} line${res.linesPosted !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not post that shipment');
      setState('review');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0"
        // handleClose already refuses to close mid-post; hiding the X here
        // too means there is no dead click to be confused by while it does.
        showCloseButton={state !== 'importing'}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Log a shipment
          </DialogTitle>
          <DialogDescription>
            Paste a supplier invoice — AI will read the header and line items, then you correct and post.
          </DialogDescription>
        </DialogHeader>

        {/* ── Idle: paste ───────────────────────────────────────────────────── */}
        {state === 'idle' && (
          <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
            <Textarea
              placeholder={`Paste the invoice text here — vendor, invoice #, date, line items, freight, tax, deposits, total…`}
              className="min-h-[220px] font-mono text-sm resize-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={handleParse} disabled={!text.trim()} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Read invoice
              </Button>
            </div>
          </div>
        )}

        {/* ── Parsing: skeleton ─────────────────────────────────────────────── */}
        {state === 'parsing' && (
          <div className="flex flex-col gap-3 px-6 py-8">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              AI is reading the invoice…
            </p>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {/* ── Review: header + lines + reconciliation ──────────────────────── */}
        {state === 'review' && (
          <>
            <div className="overflow-y-auto flex-1 min-h-0">
              {/* Header fields — every one AI-prefilled and editable. Vendor
                  and invoice date are required; everything else defaults to
                  0 (a charge the invoice does not mention is $0, not unknown). */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b">
                <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
                  <Label htmlFor="ship-vendor">Vendor *</Label>
                  <Input
                    id="ship-vendor"
                    value={header.vendorName}
                    onChange={(e) => updateHeader('vendorName', e.target.value)}
                    aria-invalid={header.vendorName.trim() === ''}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-invoice-number">Invoice #</Label>
                  <Input
                    id="ship-invoice-number"
                    value={header.invoiceNumber}
                    onChange={(e) => updateHeader('invoiceNumber', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-invoice-date">Invoice date *</Label>
                  <Input
                    id="ship-invoice-date"
                    type="date"
                    value={header.invoiceDate}
                    onChange={(e) => updateHeader('invoiceDate', e.target.value)}
                    aria-invalid={header.invoiceDate.trim() === ''}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-freight">Freight</Label>
                  <Input
                    id="ship-freight"
                    type="number" min={0} step="0.01"
                    value={header.freight}
                    onChange={(e) => updateHeader('freight', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-tax">Tax</Label>
                  <Input
                    id="ship-tax"
                    type="number" min={0} step="0.01"
                    value={header.tax}
                    onChange={(e) => updateHeader('tax', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-deposits">Deposits</Label>
                  <Input
                    id="ship-deposits"
                    type="number" min={0} step="0.01"
                    value={header.deposits}
                    onChange={(e) => updateHeader('deposits', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-other">Other charges</Label>
                  <Input
                    id="ship-other"
                    type="number" min={0} step="0.01"
                    value={header.otherCharges}
                    onChange={(e) => updateHeader('otherCharges', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ship-total">Invoice total</Label>
                  <Input
                    id="ship-total"
                    type="number" min={0} step="0.01"
                    placeholder="—"
                    value={header.invoiceTotal ?? ''}
                    onChange={(e) => updateHeader('invoiceTotal', e.target.value === '' ? null : (parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              {/* Lines table */}
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b z-10">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Item</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-20">Qty</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-28">Unit</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">Unit cost</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">Line total</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-56">Price change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line, index) => {
                      const change = line.existingId ? priceChanges.get(line.existingId) : undefined;
                      const flagged = Boolean(change?.needsConfirm);
                      const unresolved = isLineUnresolved(line, priceChanges);
                      const error = lineError(line);
                      const lineTotal = line.quantity * (line.unitCost ?? 0);

                      return (
                        <tr key={index} className={unresolved || error ? 'bg-amber-500/5' : undefined}>
                          <td className="px-3 py-2">
                            {line.existingId ? (
                              <Badge variant="secondary" className="text-[10px] font-medium whitespace-nowrap">MATCH</Badge>
                            ) : (
                              <Badge className="text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                NEW ITEM
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 min-w-[180px]">
                            <input
                              className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm"
                              value={line.name}
                              onChange={(e) => updateLine(index, 'name', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number" min={0} step="any"
                              className={`w-16 bg-transparent border-0 focus:outline-none focus:ring-1 rounded px-1 py-0.5 text-sm tabular-nums ${
                                !Number.isFinite(line.quantity) || line.quantity <= 0
                                  ? 'ring-1 ring-destructive/50 focus:ring-destructive'
                                  : 'focus:ring-primary/40'
                              }`}
                              value={line.quantity}
                              onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)}
                            />
                            {hasPack(line.unitsPerPack) && (
                              <button
                                type="button"
                                onClick={() => togglePack(index)}
                                title={line.packApplied
                                  ? `Fold back to ${line.unitsPerPack}-unit packs — the line total stays the same`
                                  : `This invoice line is in packs — expand to singles (×${line.unitsPerPack}), splitting the unit cost so the line total is unchanged`}
                                className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums border transition-colors ${
                                  line.packApplied
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                                }`}
                              >
                                {line.packApplied ? `÷${line.unitsPerPack}` : `×${line.unitsPerPack}`}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-sm w-full"
                              value={UNITS.includes(line.unit) ? line.unit : 'each'}
                              onChange={(e) => updateLine(index, 'unit', e.target.value)}
                            >
                              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                              {line.unit && !UNITS.includes(line.unit) && (
                                <option value={line.unit}>{line.unit}</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-0.5">
                              <span className="text-muted-foreground text-xs">$</span>
                              <input
                                type="number" min={0} step="0.01"
                                placeholder="—"
                                className={`w-16 bg-transparent border-0 focus:outline-none focus:ring-1 rounded px-1 py-0.5 text-sm tabular-nums ${
                                  line.unitCost !== null && (!Number.isFinite(line.unitCost) || line.unitCost < 0)
                                    ? 'ring-1 ring-destructive/50 focus:ring-destructive'
                                    : 'focus:ring-primary/40'
                                }`}
                                value={line.unitCost ?? ''}
                                onChange={(e) => updateLine(index, 'unitCost', e.target.value ? parseFloat(e.target.value) : null)}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{money(lineTotal)}</td>
                          <td className="px-3 py-2">
                            {error ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                {error}
                              </span>
                            ) : flagged && change ? (
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  {money(change.from)} → {money(change.to)}
                                  {' '}({change.pctChange > 0 ? '+' : ''}{(change.pctChange * 100).toFixed(0)}%)
                                </span>
                                <label className="flex items-center gap-1.5 text-xs">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={line.approvedCost !== null && line.approvedCost === line.unitCost}
                                    onChange={(e) => toggleApproval(index, e.target.checked)}
                                  />
                                  Apply this price
                                </label>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reconciliation — visible before posting, on purpose: after
                posting, a mismatch is a wrong pour cost next month rather
                than a number on screen. */}
            <div className="px-6 py-3 border-t bg-muted/30 shrink-0 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Computed: <span className="font-medium text-foreground tabular-nums">{money(reconciliation.computed)}</span>
                {reconciliation.stated !== null && (
                  <>
                    {' · '}Invoice: <span className="font-medium text-foreground tabular-nums">{money(reconciliation.stated)}</span>
                  </>
                )}
              </span>
              {reconciliation.stated === null ? (
                <span className="text-xs text-muted-foreground">No invoice total to check against</span>
              ) : reconciliation.matches ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Ties to the invoice
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {money(Math.abs(reconciliation.difference))} {reconciliation.difference > 0 ? 'over' : 'short of'} the invoice total
                </span>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t shrink-0">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </button>
              {firstInvalidLine ? (
                <span className="flex items-center gap-1 text-xs font-medium text-destructive ml-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  &quot;{firstInvalidLine.name}&quot; {lineError(firstInvalidLine)}
                </span>
              ) : unresolvedPriceChanges && (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 ml-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Confirm the flagged price{lines.filter((l) => isLineUnresolved(l, priceChanges)).length !== 1 ? 's' : ''} above to post
                </span>
              )}
              <Button onClick={handlePost} disabled={!canPost} className="ml-auto gap-2">
                <Check className="h-4 w-4" />
                Post shipment
              </Button>
            </div>
          </>
        )}

        {/* ── Importing: progress ───────────────────────────────────────────── */}
        {state === 'importing' && (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">Posting shipment and moving stock…</p>
          </div>
        )}

        {/* ── Done: summary ─────────────────────────────────────────────────── */}
        {state === 'done' && result && (
          <div className="flex flex-col gap-5 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div>
                <p className="font-semibold">Shipment posted</p>
                <p className="text-sm text-muted-foreground">
                  {result.linesPosted} line{result.linesPosted !== 1 ? 's' : ''} posted — stock and cost prices are updated.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={reset} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Log another
              </Button>
              <Button onClick={() => handleClose(false)} className="gap-2">
                <X className="h-4 w-4" />
                Back to shipments
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
