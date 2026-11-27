import { describe, it, expect } from 'vitest'
import { toDecimalString, parseWireDecimal, sumWireMoney } from './decimal'

describe('toDecimalString', () => {
  it.each([
    [12.5, 2, '12.50'], [0, 2, '0.00'], [-0, 2, '0.00'], [0.1 + 0.2, 2, '0.30'],
    [1234567.89, 2, '1234567.89'], [-0.5, 2, '-0.50'], [0.0625, 4, '0.0625'],
    [1234.5, 2, '1234.50'], [123456789012.34, 2, '123456789012.34'],
    ['12.5', 2, '12.50'], ['12.50', 2, '12.50'], [-0.001, 2, null],
  ])('%s @%s', (n, p, want) => {
    if (want === null) expect(() => toDecimalString(n, p as 2)).toThrow(RangeError)
    else expect(toDecimalString(n, p as 2 | 4)).toBe(want)
  })
  it('refuses a figure not at scale instead of rounding', () => {
    expect(() => toDecimalString(1.005, 2)).toThrow(RangeError)
    expect(() => toDecimalString(12.345, 2)).toThrow(RangeError)
    expect(() => toDecimalString(0.00005, 4)).toThrow(RangeError)
  })
  it('refuses non-finite, huge, junk', () => {
    for (const bad of [NaN, Infinity, -Infinity, 1e15, -1e15, 'abc', '1e3', ''])
      expect(() => toDecimalString(bad, 2)).toThrow()
  })
  it('null passes through as null', () => expect(toDecimalString(null, 2)).toBeNull())
  it('never exponent, always a string at scale', () => {
    for (const n of [1e-7 * 0, 999999999999999, 0.01, 100000000000]) {
      const s = toDecimalString(n, 2)
      expect(typeof s).toBe('string')
      expect(s).toMatch(/^-?\d+\.\d{2}$/)
    }
  })
})

describe('parseWireDecimal', () => {
  it('accepts canonical forms', () => {
    for (const s of ['12.5', '12.50', '0', '-3', '-0.25', '123456789012.34'])
      expect(parseWireDecimal(s)).toEqual({ ok: true, value: s })
  })
  it.each(['1e3', '+5', ' 5', '5 ', '1,000', '', 'NaN', 'Infinity', '1.', '.5', '--1', '1'.repeat(40)])(
    'rejects %j', (s) => expect(parseWireDecimal(s).ok).toBe(false))
  it('rejects non-strings', () => {
    expect(parseWireDecimal(5 as unknown as string).ok).toBe(false)
    expect(parseWireDecimal(null as unknown as string).ok).toBe(false)
  })
})

describe('sumWireMoney', () => {
  it('is exact in cents', () => {
    expect(sumWireMoney(['0.10', '0.20'])).toBe('0.30')
    expect(sumWireMoney(['12.5', '0.05', '-3'])).toBe('9.55')
    expect(sumWireMoney(['123456789012.34', '0.01'])).toBe('123456789012.35')
    expect(sumWireMoney(['0.10', '-0.10'])).toBe('0.00')
    expect(sumWireMoney([])).toBe('0.00')
  })
  it('throws on bad or off-scale input', () => {
    expect(() => sumWireMoney(['1e3'])).toThrow(RangeError)
    expect(() => sumWireMoney(['1.005'])).toThrow(RangeError)
  })
})
