import { describe, it, expect, vi, beforeEach } from 'vitest';

const computePayroll = vi.fn();
const loadEmployees = vi.fn();
const tablesStatus = vi.fn();

vi.mock('@/app/(app)/app/payroll/actions', () => ({ computePayroll: (...a: unknown[]) => computePayroll(...a) }));
vi.mock('@/app/(app)/app/payroll/_shared', () => ({ loadEmployees: () => loadEmployees() }));
vi.mock('@/lib/payroll/tax/ui', () => ({ tablesStatus: (y: number) => tablesStatus(y) }));

import { computeWithholding } from '@/lib/payroll/tax/withholding';
import { computeRunWithholding } from '@/app/(app)/app/payroll/run-withholding';

const entry = (id: string) => ({
  employeeId: id, employeeName: id, totalCompensation: 800, regularPay: 700, overtimePay: 0,
}) as never;

const ON = { tax: { enabled: true, payFrequency: 'weekly' } };
const W2 = (id: string) => ({ id, name: id, tax_classification: 'w2', w4_filing_status: 'single' });

beforeEach(() => {
  computePayroll.mockReset().mockResolvedValue([]);
  loadEmployees.mockReset().mockResolvedValue([W2('a'), W2('b')]);
  tablesStatus.mockReset().mockReturnValue({ usable: true });
});

describe('computeRunWithholding', () => {
  // Catches: computing (or querying) for a bar with tax off.
  it('off: computes nothing', async () => {
    const r = await computeRunWithholding({}, '2026-03-02', '2026-03-08', [entry('a')]);
    expect(r.kind).toBe('off');
    expect(computePayroll).not.toHaveBeenCalled();
    expect(loadEmployees).not.toHaveBeenCalled();
  });

  // Catches: running the full-year payroll or returning figures from placeholder tables.
  it('unusable: carries the message and does no payroll work', async () => {
    tablesStatus.mockReturnValue({ usable: false, reason: 'placeholder', message: 'fake tables' });
    const r = await computeRunWithholding(ON, '2026-03-02', '2026-03-08', [entry('a')]);
    expect(r).toEqual({ kind: 'unusable', message: 'fake tables' });
    expect(computePayroll).not.toHaveBeenCalled();
    expect(loadEmployees).not.toHaveBeenCalled();
  });

  // Catches: the regression to computePayroll(yearStart, startDate), which
  // double-counts the period's first day.
  it('ok: fetches YTD from 1 Jan to the day BEFORE the period', async () => {
    const r = await computeRunWithholding(ON, '2026-03-02', '2026-03-08', [entry('a')]);
    expect(r.kind).toBe('ok');
    expect(computePayroll).toHaveBeenCalledTimes(1);
    expect(computePayroll).toHaveBeenCalledWith('2026-01-01', '2026-03-01');
  });

  // Catches: an inverted-range call for a period starting 1 January.
  it('ok: makes no YTD call when the period starts on 1 January', async () => {
    const r = await computeRunWithholding(ON, '2026-01-01', '2026-01-07', [entry('a')]);
    expect(r.kind).toBe('ok');
    expect(computePayroll).not.toHaveBeenCalled();
  });

  // Catches: ignoring YTD results (every employee treated as 0 YTD). 'a' is far
  // past the Social Security wage base; 'b' has no earlier wages, so 'a' must
  // owe strictly less Social Security this period.
  it('ok: each employee YTD wages reach the engine', async () => {
    computePayroll.mockResolvedValue([{ employeeId: 'a', totalCompensation: 1_000_000 }]);
    const r = await computeRunWithholding(ON, '2026-03-02', '2026-03-08', [entry('a'), entry('b')]);
    expect(r.kind).toBe('ok');
    const map = (r as Extract<typeof r, { kind: 'ok' }>).byEmployee;
    expect(map.get('b')!.socialSecurity).toBeGreaterThan(0);
    expect(map.get('a')!.socialSecurity).toBeLessThan(map.get('b')!.socialSecurity);
  });

  // Catches: availableToWithhold = regularPay + overtimePay (tips excluded).
  // Tips are paid on the cheque here, so available must equal total pay. The
  // entry has $50 of wages and $750 of tips, so the two implementations differ.
  it('ok: all pay including tips is available to withhold', async () => {
    const tippy = { employeeId: 'a', employeeName: 'a', totalCompensation: 800, regularPay: 50, overtimePay: 0 } as never;
    const r = await computeRunWithholding(ON, '2026-03-02', '2026-03-08', [tippy]);
    expect(r.kind).toBe('ok');
    const got = (r as Extract<typeof r, { kind: 'ok' }>).byEmployee.get('a')!;
    const base = {
      grossForPeriod: 800, ytdWages: 0, taxYear: 2026,
      profile: { classification: 'w2', filingStatus: 'single', multipleJobs: null, dependentsAmount: null,
        otherIncome: null, deductions: null, extraWithholding: null, exempt: null },
      config: { enabled: true, payFrequency: 'weekly', stateEnabled: false, stateRate: 0 },
    } as const;
    const full = computeWithholding({ ...base, availableToWithhold: 800 });
    const wagesOnly = computeWithholding({ ...base, availableToWithhold: 50 });
    expect(wagesOnly.total).not.toBe(full.total); // premise: the two differ
    expect(got.total).toBe(full.total);
  });
});
