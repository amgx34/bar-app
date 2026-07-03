/**
 * NACHA ACH file generator — CCD/PPD credit (direct deposit) format.
 *
 * Every line is exactly 94 characters. The output is a plain-text file
 * the bar owner uploads to their bank's business online banking portal
 * (Chase ACH Manager, BofA CashPro, Wells Fargo CEO, etc.) at zero cost.
 *
 * References:
 *   NACHA Operating Rules & Guidelines — 2024 edition
 *   https://www.nacha.org/content/ach-file-formatting
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type NachaConfig = {
  /** Bar's bank routing number (9 digits) — the ODFI */
  odfiRouting:   string;
  /** Bar's bank name (shown in file header) */
  odfiName:      string;
  /** Company name used in payroll entries (max 16 chars) */
  companyName:   string;
  /** Company EIN without dashes, 9 digits — becomes "1" + EIN in file */
  companyEin:    string;
  /** When to process — defaults to next business day */
  effectiveDate?: Date;
};

export type NachaEntry = {
  employeeName:  string;
  employeeId:    string;
  routingNumber: string;   // 9-digit routing of employee's bank
  accountNumber: string;   // employee's account number
  accountType:   'checking' | 'savings';
  /** Whole dollar amount (e.g. 523.75) — converted to cents internally */
  amount:        number;
};

export type NachaResult = {
  /** The NACHA file content — save as .ach */
  content:      string;
  /** How many entries were included */
  entryCount:   number;
  /** Total dollar amount across all entries */
  totalAmount:  number;
  /** Effective date used */
  effectiveDate: string;
};

// ── Format helpers ─────────────────────────────────────────────────────────────

/** Pad / truncate to exact width. Default: left-aligned, space-padded. */
function f(
  value: string | number,
  len:   number,
  align: 'L' | 'R' = 'L',
  fill  = ' ',
): string {
  const s   = String(value).replace(/[\r\n]/g, ' ');
  const cut = s.slice(0, len);
  if (cut.length === len) return cut;
  const pad = fill.repeat(len - cut.length);
  return align === 'R' ? pad + cut : cut + pad;
}

/** Right-aligned zero-padded number, width w. */
function n(value: number | bigint, w: number): string {
  return f(String(value), w, 'R', '0');
}

function nachaDate(d: Date): string {
  return (
    String(d.getFullYear()).slice(-2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  );
}

function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Sum the entry hash values, take the last 10 decimal digits (no BigInt literals). */
function entryHash(total: bigint): string {
  const cap = BigInt('10000000000');
  return n(total % cap, 10);
}

// ── Record builders (each returns exactly 94 chars) ───────────────────────────

function fileHeader(cfg: NachaConfig, fileDate: string, fileTime: string): string {
  const odfi9   = cfg.odfiRouting.replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  const compId  = '1' + cfg.companyEin.replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  return (
    '1' +
    '01' +
    ' ' + odfi9 +                             // 10: immediate destination (space + routing)
    ' ' + compId.slice(0, 9) +               // 10: immediate origin (space + 9 chars)
    fileDate +                                //  6: creation date YYMMDD
    fileTime +                                //  4: creation time HHMM
    'A' +                                     //  1: file ID modifier
    '094' +                                   //  3: record size
    '10' +                                    //  2: blocking factor
    '1' +                                     //  1: format code
    f(cfg.odfiName.toUpperCase(), 23) +       // 23: destination name
    f(cfg.companyName.toUpperCase(), 23) +    // 23: origin name
    f('', 8)                                  //  8: reference code (blank)
  );
}

function batchHeader(
  cfg:        NachaConfig,
  compId:     string,
  effDate:    string,
  fileDate:   string,
  batchNum:   number,
): string {
  const odfi8 = cfg.odfiRouting.replace(/\D/g, '').slice(0, 8);
  return (
    '5' +
    '220' +                                   //  3: service class (credits only)
    f(cfg.companyName.toUpperCase(), 16) +    // 16: company name
    f('', 20) +                               // 20: discretionary data (blank)
    f(compId, 10) +                           // 10: company identification
    'PPD' +                                   //  3: standard entry class (prearranged)
    f('PAYROLL', 10) +                        // 10: entry description
    fileDate +                                //  6: descriptive date
    effDate +                                 //  6: effective entry date
    '   ' +                                   //  3: settlement date (bank fills)
    '1' +                                     //  1: originator status code
    f(odfi8, 8) +                             //  8: ODFI routing (first 8)
    n(batchNum, 7)                            //  7: batch number
  );
}

function entryDetail(
  cfg:      NachaConfig,
  entry:    NachaEntry,
  cents:    bigint,
  seqNum:   number,
): string {
  const routing9 = entry.routingNumber.replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  const rdfi8    = routing9.slice(0, 8);
  const checkDig = routing9[8] ?? '0';
  const txCode   = entry.accountType === 'savings' ? '32' : '22';
  const odfi8    = cfg.odfiRouting.replace(/\D/g, '').slice(0, 8);
  const trace    = odfi8 + n(seqNum, 7);

  return (
    '6' +
    txCode +                                  //  2: transaction code
    rdfi8 +                                   //  8: RDFI routing (first 8)
    checkDig +                                //  1: check digit (9th digit)
    f(entry.accountNumber, 17) +              // 17: account number (left-justified)
    n(cents, 10) +                            // 10: amount in cents
    f(entry.employeeId, 15) +                 // 15: individual ID number
    f(entry.employeeName.toUpperCase(), 22) + // 22: individual name
    '  ' +                                    //  2: discretionary data (blank)
    '0' +                                     //  1: addenda indicator (none)
    f(trace, 15)                              // 15: trace number
  );
}

function batchControl(
  cfg:        NachaConfig,
  compId:     string,
  count:      number,
  hash:       bigint,
  totalCents: bigint,
  batchNum:   number,
): string {
  const odfi8 = cfg.odfiRouting.replace(/\D/g, '').slice(0, 8);
  return (
    '8' +
    '220' +                       //  3: service class
    n(count, 6) +                 //  6: entry count
    entryHash(hash) +             // 10: entry hash
    n(0, 12) +                    // 12: total debit ($0 for payroll credits)
    n(totalCents, 12) +           // 12: total credit
    f(compId, 10) +               // 10: company identification
    f('', 19) +                   // 19: message auth code (blank)
    f('', 6) +                    //  6: reserved
    f(odfi8, 8) +                 //  8: ODFI routing
    n(batchNum, 7)                //  7: batch number
  );
}

function fileControl(
  batchCount:  number,
  blockCount:  number,
  entryCount:  number,
  hash:        bigint,
  totalCents:  bigint,
): string {
  return (
    '9' +
    n(batchCount, 6) +            //  6: batch count
    n(blockCount, 6) +            //  6: block count
    n(entryCount, 8) +            //  8: entry/addenda count
    entryHash(hash) +             // 10: entry hash
    n(0, 12) +                    // 12: total debit
    n(totalCents, 12) +           // 12: total credit
    f('', 39)                     // 39: reserved
  );
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateNachaFile(cfg: NachaConfig, entries: NachaEntry[]): NachaResult {
  if (!entries.length) throw new Error('No direct deposit entries to include.');

  const now      = new Date();
  const fileDate = nachaDate(now);
  const fileTime =
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
  const effDay   = cfg.effectiveDate ?? nextBusinessDay(now);
  const effDate  = nachaDate(effDay);
  const compId   = '1' + cfg.companyEin.replace(/\D/g, '').slice(0, 9).padStart(9, '0');

  const lines: string[] = [];
  lines.push(fileHeader(cfg, fileDate, fileTime));
  lines.push(batchHeader(cfg, compId, effDate, fileDate, 1));

  let hashAccum  = BigInt(0);
  let totalCents = BigInt(0);

  entries.forEach((entry, idx) => {
    const cents = BigInt(Math.round(entry.amount * 100));
    const routing9 = entry.routingNumber.replace(/\D/g, '').slice(0, 8);
    hashAccum  += BigInt(parseInt(routing9, 10));
    totalCents += cents;
    lines.push(entryDetail(cfg, entry, cents, idx + 1));
  });

  lines.push(batchControl(cfg, compId, entries.length, hashAccum, totalCents, 1));

  // Compute block count before adding file control (total lines + 1 for file ctrl)
  const totalWithControl = lines.length + 1;
  const blockCount       = Math.ceil(totalWithControl / 10);
  lines.push(fileControl(1, blockCount, entries.length, hashAccum, totalCents));

  // Pad to multiple of 10 with 9-filled records
  while (lines.length % 10 !== 0) lines.push('9'.repeat(94));

  // Validate every line is exactly 94 chars
  for (const line of lines) {
    if (line.length !== 94) throw new Error(`NACHA record length error: got ${line.length}, expected 94`);
  }

  return {
    content:      lines.join('\r\n') + '\r\n',
    entryCount:   entries.length,
    totalAmount:  Number(totalCents) / 100,
    effectiveDate: effDate,
  };
}
