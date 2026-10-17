// lib/payroll/tax/settings.test.ts
import { describe, it, expect } from 'vitest';
import { taxConfigFromSettings, withTaxConfig } from './settings';

describe('taxConfigFromSettings', () => {
  // Catches: an implementation that defaults enabled or stateEnabled to true.
  it('defaults to off when nothing is configured', () => {
    const c = taxConfigFromSettings({});
    expect(c.enabled).toBe(false);
    expect(c.stateEnabled).toBe(false);
  });

  // Catches: any field dropped or renamed.
  it('reads a configured setup', () => {
    const c = taxConfigFromSettings({
      tax: { enabled: true, payFrequency: 'weekly', stateEnabled: true, stateRate: 4.5 },
    });
    expect(c).toEqual({
      enabled: true, payFrequency: 'weekly', stateEnabled: true, stateRate: 4.5,
      tipsPaidOnCheque: false,
    });
  });

  // Catches: trusting payFrequency through unvalidated (would yield 'fortnightly').
  it('defaults an unrecognised pay frequency to biweekly', () => {
    const c = taxConfigFromSettings({ tax: { enabled: true, payFrequency: 'fortnightly' } });
    expect(c.payFrequency).toBe('biweekly');
  });

  // Catches: a clamp missing either bound.
  it('clamps a hand-edited state rate into range', () => {
    expect(taxConfigFromSettings({ tax: { stateRate: -5 } }).stateRate).toBe(0);
    expect(taxConfigFromSettings({ tax: { stateRate: 500 } }).stateRate).toBe(100);
  });

  // Catches: the bare Math.min(100, Math.max(0, Number(x))) clamp. Verified
  // against it: 'abc', NaN, '4.5%' and {} all come out NaN (Math.max/min
  // propagate it); Infinity comes out 100 and true comes out 1 - plausible
  // rates invented from garbage.
  it.each([
    ['non-numeric string', 'abc'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['numeric string with junk', '4.5%'],
    ['object', {}],
    ['boolean', true],
  ])('falls back to 0 for a state rate that is not a finite number (%s)', (_label, bad) => {
    const rate = taxConfigFromSettings({ tax: { stateRate: bad } }).stateRate;
    expect(Number.isNaN(rate)).toBe(false);
    expect(rate).toBe(0);
  });

  // Catches: a guard so aggressive it zeroes every string, silently turning a
  // stored "4.5" into no state tax.
  it('still reads a numeric string state rate', () => {
    expect(taxConfigFromSettings({ tax: { stateRate: '4.5' } }).stateRate).toBe(4.5);
  });

  // Catches: truthy checks on the flags ('true' or 1 would switch withholding on).
  it('only a literal true enables withholding', () => {
    expect(taxConfigFromSettings({ tax: { enabled: 'true' } }).enabled).toBe(false);
    expect(taxConfigFromSettings({ tax: { enabled: 1 } }).enabled).toBe(false);
    expect(taxConfigFromSettings({ tax: { stateEnabled: 'yes' } }).stateEnabled).toBe(false);
  });

  // Catches: defaulting tipsPaidOnCheque to true (the silent-failure side), or
  // coercing truthy junk to true.
  it('tipsPaidOnCheque is false unless exactly true, and round-trips true', () => {
    expect(taxConfigFromSettings({}).tipsPaidOnCheque).toBe(false);
    expect(taxConfigFromSettings({ tax: { tipsPaidOnCheque: 'true' } }).tipsPaidOnCheque).toBe(false);
    expect(taxConfigFromSettings({ tax: { tipsPaidOnCheque: 1 } }).tipsPaidOnCheque).toBe(false);
    expect(taxConfigFromSettings({ tax: { tipsPaidOnCheque: true } }).tipsPaidOnCheque).toBe(true);
  });

  // Catches: reading properties off a string / throwing on null.
  it('survives a non-object tax key', () => {
    expect(taxConfigFromSettings({ tax: 'nonsense' }).enabled).toBe(false);
    expect(taxConfigFromSettings({ tax: null }).enabled).toBe(false);
  });
});

describe('withTaxConfig', () => {
  // Catches: spreading the patch unfiltered (mass assignment into bar_settings.tax).
  it('drops keys that are not one of the five tax settings', () => {
    const next = withTaxConfig(
      {},
      { enabled: true, evil: 'x', __proto__: { polluted: 1 }, payFrequency: 'weekly' } as never,
    );
    expect(next.tax).toEqual({ enabled: true, payFrequency: 'weekly' });
  });

  // Catches: an allowlist that forgot the new key, so the setting silently never saves.
  it('lets tipsPaidOnCheque through, and a single-key patch keeps the other four', () => {
    const next = withTaxConfig(
      { tax: { enabled: true, payFrequency: 'weekly', stateEnabled: true, stateRate: 4 } },
      { tipsPaidOnCheque: true },
    );
    expect(next.tax).toEqual({
      enabled: true, payFrequency: 'weekly', stateEnabled: true, stateRate: 4,
      tipsPaidOnCheque: true,
    });
  });

  // Catches: treating false as "no patch" (a truthiness check), which would make
  // switching the setting back off impossible.
  it('persists tipsPaidOnCheque: false over a stored true', () => {
    const next = withTaxConfig({ tax: { tipsPaidOnCheque: true } }, { tipsPaidOnCheque: false });
    expect((next.tax as Record<string, unknown>).tipsPaidOnCheque).toBe(false);
  });

  // Catches: replacing settings with { tax } alone.
  it('leaves every other setting untouched', () => {
    const next = withTaxConfig(
      { barback_tip_pct: 20, cutoff_hour: 4 },
      { enabled: true },
    );
    expect(next.barback_tip_pct).toBe(20);
    expect(next.cutoff_hour).toBe(4);
  });

  // Catches: replacing the tax object instead of merging (enabled would vanish).
  it('merges into an existing tax object rather than replacing it', () => {
    const next = withTaxConfig(
      { tax: { enabled: true, stateRate: 5 } },
      { stateRate: 6 },
    );
    expect(next.tax).toEqual({ enabled: true, stateRate: 6 });
  });

  // Catches: mutating the input. Frozen input makes an in-place write throw
  // (ES modules are strict); the identity checks catch returning the same object.
  it('does not mutate its input', () => {
    const settings = Object.freeze({
      cutoff_hour: 4,
      tax: Object.freeze({ enabled: true, stateRate: 5 }),
    });
    const next = withTaxConfig(settings, { stateRate: 6 });
    expect(settings.tax).toEqual({ enabled: true, stateRate: 5 });
    expect(next).not.toBe(settings);
    expect(next.tax).not.toBe(settings.tax);
  });

  // Catches: spreading a string tax value, which yields {0:'n',1:'o',...} and
  // would be persisted into the column.
  it('discards a non-object tax value instead of spreading it', () => {
    const next = withTaxConfig({ tax: 'nonsense' }, { enabled: true });
    expect(next.tax).toEqual({ enabled: true });
  });
});
