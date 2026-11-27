// Money and stock cross the wire as decimal strings, never JSON numbers.
// This FORMATS; it does not round (architecture doc, Decision 2). A figure not
// already at its scale is a caller bug and throws, so web and app cannot differ by a cent.

export type WireScale = 2 | 4
export type WireDecimalResult = { ok: true; value: string } | { ok: false; error: string }

const CANONICAL = /^-?\d+(\.\d+)?$/
const MAX_LEN = 32
const LIMIT = 1e15
// Float noise from sums like 0.1 + 0.2 is ~1e-17 relative; a real half-cent is 0.5 scaled.
const SCALED_TOLERANCE = 1e-6

function fromString(s: string, places: WireScale): string {
  if (s.length > MAX_LEN || !CANONICAL.test(s)) throw new RangeError(`not a canonical decimal: ${JSON.stringify(s)}`)
  const neg = s.startsWith('-')
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.')
  if (/[1-9]/.test(frac.slice(places))) throw new RangeError(`${s} is not at scale ${places}`)
  const out = `${int.replace(/^0+(?=\d)/, '')}.${frac.slice(0, places).padEnd(places, '0')}`
  return neg && /[1-9]/.test(out) ? `-${out}` : out
}

export function toDecimalString(n: number | string, places: WireScale): string
export function toDecimalString(n: number | string | null, places: WireScale): string | null
export function toDecimalString(n: number | string | null, places: WireScale): string | null {
  if (n === null) return null
  if (typeof n === 'string') return fromString(n, places)
  if (!Number.isFinite(n) || Math.abs(n) >= LIMIT) throw new RangeError(`not a wire-safe number: ${n}`)
  const scaled = n * 10 ** places
  if (Math.abs(scaled - Math.round(scaled)) > SCALED_TOLERANCE) throw new RangeError(`${n} is not at scale ${places}`)
  const s = n.toFixed(places)
  // toFixed(-0) and tiny negatives can yield "-0.00"
  return /[1-9]/.test(s) ? s : s.replace('-', '')
}

export function parseWireDecimal(s: unknown): WireDecimalResult {
  if (typeof s !== 'string') return { ok: false, error: 'not a string' }
  if (s.length > MAX_LEN) return { ok: false, error: 'too long' }
  if (!CANONICAL.test(s)) return { ok: false, error: 'not a canonical decimal' }
  return { ok: true, value: s }
}

/** Exact sum of money strings, in integer cents (BigInt). Throws on a bad or sub-cent input. */
export function sumWireMoney(values: string[]): string {
  let cents = BigInt(0)
  for (const v of values) {
    const s = toDecimalString(v, 2)
    cents += BigInt(s.replace('.', ''))
  }
  const abs = cents < BigInt(0) ? -cents : cents
  const d = abs.toString().padStart(3, '0')
  return `${cents < BigInt(0) ? '-' : ''}${d.slice(0, -2)}.${d.slice(-2)}`
}
