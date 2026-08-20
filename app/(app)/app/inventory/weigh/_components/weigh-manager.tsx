'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Scale,
  FlaskConical, BarChart3, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import {
  createWeighReport,
  addWeighItem,
  deleteWeighItem,
  deleteWeighReport,
  getWeighReport,
  getPourAnalysis,
} from '../actions';
import type {
  WeighReport,
  WeighReportDetail,
  InventoryItemForWeigh,
  PourAnalysisItem,
} from '../actions';

// ── helpers ───────────────────────────────────────────────────────────────────

const OZ_PER_ML = 0.033814;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

const SHIFT_LABELS: Record<string, string> = {
  opening: 'Opening',
  closing: 'Closing',
  daily:   'Daily',
};

const SHIFT_COLORS: Record<string, string> = {
  opening: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  closing: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  daily:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
};

// ── sub-components ────────────────────────────────────────────────────────────

function LevelInput({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.1"
        min="0"
        max="1"
        placeholder="0.0–1.0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}

// ── Add-item form ─────────────────────────────────────────────────────────────

function AddItemForm({
  reportId,
  inventoryItems,
  onDone,
}: {
  reportId: string;
  inventoryItems: InventoryItemForWeigh[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId]   = useState('');
  const [itemName,   setItemName]     = useState('');
  const [openLevel,  setOpenLevel]    = useState('');
  const [closeLevel, setCloseLevel]   = useState('');
  const [opened,     setOpened]       = useState('0');
  const [notes,      setNotes]        = useState('');
  const [bottleSize, setBottleSize]   = useState('');
  const [pourSize,   setPourSize]     = useState('');
  const [costPrice,  setCostPrice]    = useState('');

  function selectInventoryItem(id: string | null) {
    if (!id) return;
    setSelectedId(id);
    const item = inventoryItems.find((i) => i.id === id);
    if (!item) return;
    setItemName(item.name);
    setBottleSize(String(item.bottle_size_ml ?? ''));
    setPourSize(String(item.pour_size_oz ?? ''));
    setCostPrice(String(item.cost_price ?? ''));
  }

  function handleSubmit() {
    if (!itemName.trim()) {
      toast.error('Item name is required');
      return;
    }
    startTransition(async () => {
      try {
        await addWeighItem({
          weigh_report_id:    reportId,
          inventory_item_id:  selectedId || null,
          item_name:          itemName.trim(),
          bottle_size_ml:     bottleSize ? Number(bottleSize) : null,
          pour_size_oz:       pourSize   ? Number(pourSize)   : null,
          cost_price:         costPrice  ? Number(costPrice)  : null,
          opening_level:      openLevel  ? Number(openLevel)  : null,
          closing_level:      closeLevel ? Number(closeLevel) : null,
          full_bottles_opened: Number(opened) || 0,
          notes:              notes || undefined,
        });
        setSelectedId(''); setItemName(''); setOpenLevel(''); setCloseLevel('');
        setOpened('0'); setNotes(''); setBottleSize(''); setPourSize(''); setCostPrice('');
        onDone();
        toast.success('Item added');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add item');
      }
    });
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <p className="text-sm font-medium">Add Bottle Measurement</p>

      {inventoryItems.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Select from inventory</Label>
          <Select value={selectedId} onValueChange={selectInventoryItem}>
            <SelectTrigger className="h-8 text-sm">
              <span className="text-sm">
                {selectedId
                  ? inventoryItems.find((i) => i.id === selectedId)?.name ?? 'Select…'
                  : 'Select inventory item (optional)'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {inventoryItems.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Item Name *</Label>
        <Input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="e.g. Casamigos Blanco 750ml"
          className="h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Bottle Size (ml)</Label>
          <Input value={bottleSize} onChange={(e) => setBottleSize(e.target.value)} type="number" min="0" placeholder="750" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pour Size (oz)</Label>
          <Input value={pourSize} onChange={(e) => setPourSize(e.target.value)} type="number" min="0" step="0.25" placeholder="1.5" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cost / Bottle ($)</Label>
          <Input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="h-8 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <LevelInput label="Opening Level (0–1)" value={openLevel}  onChange={setOpenLevel}  />
        <LevelInput label="Closing Level (0–1)" value={closeLevel} onChange={setCloseLevel} />
        <div className="space-y-1">
          <Label className="text-xs">Full Bottles Opened</Label>
          <Input value={opened} onChange={(e) => setOpened(e.target.value)} type="number" min="0" className="h-8 text-sm" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes…" className="h-8 text-sm" />
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending} className="gap-1">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Report detail panel ───────────────────────────────────────────────────────

function ReportDetail({
  report,
  inventoryItems,
  onRefresh,
}: {
  report: WeighReportDetail;
  inventoryItems: InventoryItemForWeigh[];
  onRefresh: (id: string) => void;
}) {
  const [addingItem, setAddingItem]       = useState(false);
  const [pending,    startTransition]     = useTransition();

  function handleDeleteItem(itemId: string) {
    startTransition(async () => {
      try {
        await deleteWeighItem(itemId);
        onRefresh(report.id);
      } catch {
        toast.error('Failed to delete item');
      }
    });
  }

  const totalCost = report.items.reduce((s, i) => s + i.cost_consumed, 0);
  const totalOz   = report.items.reduce((s, i) => s + i.oz_consumed,   0);

  return (
    <div className="mt-3 space-y-3">
      {report.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-1.5 font-medium">Item</th>
                <th className="text-right py-1.5 font-medium">Open</th>
                <th className="text-right py-1.5 font-medium">Close</th>
                <th className="text-right py-1.5 font-medium">Btls</th>
                <th className="text-right py-1.5 font-medium">Oz</th>
                <th className="text-right py-1.5 font-medium">Cost</th>
                <th className="text-right py-1.5 font-medium">Pours</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 font-medium max-w-[180px] truncate" title={item.item_name}>
                    {item.item_name}
                    {item.bottle_size_ml && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {item.bottle_size_ml}ml
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{item.opening_level?.toFixed(1) ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{item.closing_level?.toFixed(1) ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{item.full_bottles_opened}</td>
                  <td className="py-2 text-right tabular-nums">{item.oz_consumed.toFixed(1)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {item.cost_consumed > 0 ? fmtMoney(item.cost_consumed) : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {item.expected_pours > 0 ? item.expected_pours.toFixed(1) : '—'}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={pending}
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {report.items.length > 1 && (
              <tfoot>
                <tr className="border-t font-semibold text-xs">
                  <td className="py-1.5 text-muted-foreground">Total ({report.items.length} items)</td>
                  <td colSpan={3} />
                  <td className="py-1.5 text-right tabular-nums">{totalOz.toFixed(1)} oz</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMoney(totalCost)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No items yet. Add bottles below.</p>
      )}

      {addingItem ? (
        <AddItemForm
          reportId={report.id}
          inventoryItems={inventoryItems}
          onDone={() => { setAddingItem(false); onRefresh(report.id); }}
        />
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddingItem(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Bottle
        </Button>
      )}
    </div>
  );
}

// ── Pour Analysis tab ─────────────────────────────────────────────────────────

function PourAnalysisPanel() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [endDate,   setEndDate]   = useState(today);
  const [items,     setItems]     = useState<PourAnalysisItem[]>([]);
  const [loaded,    setLoaded]    = useState(false);
  const [pending,   startTransition] = useTransition();

  function handleLoad() {
    startTransition(async () => {
      try {
        const result = await getPourAnalysis(startDate, endDate);
        setItems(result);
        setLoaded(true);
      } catch {
        toast.error('Failed to load pour analysis');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm w-36" />
        </div>
        <Button size="sm" onClick={handleLoad} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
          Load Analysis
        </Button>
      </div>

      {loaded && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No weigh report data found for this period. Create reports in the Reports tab.
        </p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-right px-3 py-2 font-medium">Bottle</th>
                <th className="text-right px-3 py-2 font-medium">Pour oz</th>
                <th className="text-right px-3 py-2 font-medium">Total oz</th>
                <th className="text-right px-3 py-2 font-medium">Est. Pours</th>
                <th className="text-right px-3 py-2 font-medium">Cost/oz</th>
                <th className="text-right px-3 py-2 font-medium">Cost Consumed</th>
                <th className="text-right px-3 py-2 font-medium">Reports</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const bottleOz  = (item.bottle_size_ml ?? 0) * OZ_PER_ML;
                const costPerOz = item.cost_price && bottleOz > 0
                  ? item.cost_price / bottleOz
                  : 0;
                return (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2 font-medium">{item.item_name}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {item.bottle_size_ml ? `${item.bottle_size_ml}ml` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.pour_size_oz ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.total_oz_consumed.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.expected_pours > 0 ? item.expected_pours.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {costPerOz > 0 ? `$${costPerOz.toFixed(3)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {item.cost_consumed > 0 ? fmtMoney(item.cost_consumed) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {item.report_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr className="font-semibold text-xs">
                <td className="px-3 py-2">Total ({items.length} items)</td>
                <td colSpan={3} />
                <td className="px-3 py-2 text-right tabular-nums">
                  {items.reduce((s, i) => s + i.expected_pours, 0).toFixed(1)}
                </td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtMoney(items.reduce((s, i) => s + i.cost_consumed, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  initialReports:  WeighReport[];
  inventoryItems:  InventoryItemForWeigh[];
}

export function WeighManager({ initialReports, inventoryItems }: Props) {
  const [tab,           setTab]          = useState<'reports' | 'pour'>('reports');
  const [reports,       setReports]      = useState(initialReports);
  const [expandedId,    setExpandedId]   = useState<string | null>(null);
  const [detailMap,     setDetailMap]    = useState<Map<string, WeighReportDetail>>(new Map());
  const [creatingReport, setCreatingReport] = useState(false);
  const [pending,       startTransition] = useTransition();

  // New report form state
  const [newDate,  setNewDate]  = useState(today);
  const [newShift, setNewShift] = useState<'opening' | 'closing' | 'daily'>('daily');
  const [newNotes, setNewNotes] = useState('');

  async function loadDetail(id: string) {
    startTransition(async () => {
      try {
        const detail = await getWeighReport(id);
        if (detail) {
          setDetailMap((prev) => new Map(prev).set(id, detail));
        }
      } catch {
        toast.error('Failed to load report');
      }
    });
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!detailMap.has(id)) loadDetail(id);
    }
  }

  function handleDeleteReport(id: string) {
    startTransition(async () => {
      try {
        await deleteWeighReport(id);
        setReports((prev) => prev.filter((r) => r.id !== id));
        if (expandedId === id) setExpandedId(null);
        toast.success('Report deleted');
      } catch {
        toast.error('Failed to delete report');
      }
    });
  }

  function handleCreateReport() {
    startTransition(async () => {
      try {
        const id = await createWeighReport({ report_date: newDate, shift: newShift, notes: newNotes || undefined });
        const newReport: WeighReport = {
          id,
          report_date: newDate,
          shift: newShift,
          notes: newNotes || null,
          created_at: new Date().toISOString(),
          item_count: 0,
        };
        setReports((prev) => [newReport, ...prev]);
        setCreatingReport(false);
        setNewDate(today()); setNewShift('daily'); setNewNotes('');
        setExpandedId(id);
        setDetailMap((prev) => new Map(prev).set(id, { ...newReport, items: [] }));
        toast.success('Report created');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create report');
      }
    });
  }

  const TAB_STYLE = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b">
        <button className={TAB_STYLE(tab === 'reports')} onClick={() => setTab('reports')}>
          <span className="flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" /> Reports
          </span>
        </button>
        <button className={TAB_STYLE(tab === 'pour')} onClick={() => setTab('pour')}>
          <span className="flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Pour Analysis
          </span>
        </button>
      </div>

      {/* Reports tab */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {creatingReport ? (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold">New Weigh Report</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Shift</Label>
                  <Select value={newShift} onValueChange={(v) => setNewShift((v ?? 'daily') as typeof newShift)}>
                    <SelectTrigger className="h-9 text-sm">
                      <span className="text-sm">{SHIFT_LABELS[newShift]}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opening">Opening</SelectItem>
                      <SelectItem value="closing">Closing</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Any notes…" className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateReport} disabled={pending} className="gap-1">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreatingReport(false)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => setCreatingReport(true)}>
              <Plus className="h-3.5 w-3.5" /> New Weigh Report
            </Button>
          )}

          {reports.length === 0 && !creatingReport && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No weigh reports yet. Create your first report to start tracking pour levels.
            </p>
          )}

          <div className="space-y-2">
            {reports.map((report) => {
              const isExpanded = expandedId === report.id;
              const detail     = detailMap.get(report.id);
              return (
                <div key={report.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(report.id)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <div>
                        <span className="font-medium text-sm">{fmtDate(report.report_date)}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          {report.item_count > 0 ? `${report.item_count} items` : 'No items'}
                        </span>
                      </div>
                      <Badge className={`text-xs ${SHIFT_COLORS[report.shift]}`}>
                        {SHIFT_LABELS[report.shift]}
                      </Badge>
                      {report.notes && (
                        <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[200px]">
                          {report.notes}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      disabled={pending}
                      onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4">
                      {detail ? (
                        <ReportDetail
                          report={detail}
                          inventoryItems={inventoryItems}
                          onRefresh={(id) => {
                            loadDetail(id);
                            setReports((prev) =>
                              prev.map((r) =>
                                r.id === id
                                  ? { ...r, item_count: (detailMap.get(id)?.items.length ?? 0) }
                                  : r,
                              ),
                            );
                          }}
                        />
                      ) : (
                        <div className="py-4 flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pour analysis tab */}
      {tab === 'pour' && <PourAnalysisPanel />}
    </div>
  );
}
