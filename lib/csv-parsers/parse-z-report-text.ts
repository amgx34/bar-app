export interface ParsedServerSales {
  name: string;
  totalSales: number;
  tipsPaidOut: number;
}

export interface ParsedZReportText {
  /** YYYY-MM-DD derived from the "DATE/TIME RUN" line */
  reportDate: string;
  /** Grand total sales (from SERVER SALES BREAKDOWN TOTALS) */
  totalSales: number;
  /** Absolute total tips paid out (from RECEIPTS section) */
  totalTips: number;
  /** Per-server breakdown */
  serverData: ParsedServerSales[];
}

/**
 * Parses the plain-text Z report format exported by Scotty's On Vine POS.
 *
 * Extracts:
 *  - Report date (DATE/TIME RUN field)
 *  - Total tips (first "Tips Paid Out" value in the RECEIPTS section)
 *  - Grand total sales
 *  - Per-server: name, Total Sales, Tips Paid Out
 */
export function parseZReportText(content: string): ParsedZReportText {
  // ── Date ──────────────────────────────────────────────────────────────────
  const runDateMatch = content.match(
    /DATE\/TIME RUN:\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/
  );
  if (!runDateMatch) {
    throw new Error(
      'Could not find "DATE/TIME RUN" in the Z report. Make sure you uploaded the correct file.'
    );
  }
  const [, m, d, y] = runDateMatch;
  const reportDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

  // ── Total tips ─────────────────────────────────────────────────────────────
  // The RECEIPTS section contains "Tips Paid Out   -1099.20" (negative = cash out).
  // We want the first occurrence (before the per-register breakdown).
  const tipsMatch = content.match(/Tips Paid Out\s+(-?[\d,]+\.\d{2})/);
  if (!tipsMatch) {
    throw new Error('Could not find "Tips Paid Out" in the Z report.');
  }
  const totalTips = Math.abs(parseFloat(tipsMatch[1].replace(/,/g, '')));

  // ── Grand total sales ──────────────────────────────────────────────────────
  const grandTotalMatch = content.match(/GRAND TOTAL SALES\s+([\d,]+\.\d{2})/);
  const totalSales = grandTotalMatch
    ? parseFloat(grandTotalMatch[1].replace(/,/g, ''))
    : 0;

  // ── SERVER SALES BREAKDOWN ─────────────────────────────────────────────────
  const serverData: ParsedServerSales[] = [];

  const markerIdx = content.indexOf('SERVER SALES BREAKDOWN');
  if (markerIdx === -1) {
    return { reportDate, totalSales, totalTips, serverData };
  }

  // Advance past the dashed header line
  const afterHeader = content.indexOf('\n', markerIdx) + 1;
  const lines = content.substring(afterHeader).split('\n');

  let current: ParsedServerSales | null = null;

  for (const line of lines) {
    // Stop when we hit the TOTALS section
    if (/^\s{10,}TOTALS\s*$/.test(line)) {
      if (current) {
        serverData.push(current);
        current = null;
      }
      break;
    }

    // Stop at a second "SERVER SALES BREAKDOWN" label (the summary repeat)
    if (line.includes('SERVER SALES BREAKDOWN') && serverData.length > 0) {
      if (current) {
        serverData.push(current);
        current = null;
      }
      break;
    }

    // Server name: 10+ leading spaces, only letters / spaces / apostrophes /
    // hyphens / periods — no digits. Must be at least 3 chars after trimming.
    if (
      /^\s{10,}[A-Za-z][A-Za-z '\-.]{1,}\s*$/.test(line) &&
      !/\d/.test(line) &&
      line.trim().length >= 3
    ) {
      if (current) serverData.push(current);
      current = { name: line.trim(), totalSales: 0, tipsPaidOut: 0 };
      continue;
    }

    if (!current) continue;

    const tsMatch = line.match(/^\s*Total Sales\s+([-\d,.]+)/);
    if (tsMatch) {
      current.totalSales = parseFloat(tsMatch[1].replace(/,/g, ''));
      continue;
    }

    const tpMatch = line.match(/^\s*Tips Paid Out\s+([-\d,.]+)/);
    if (tpMatch) {
      current.tipsPaidOut = Math.abs(parseFloat(tpMatch[1].replace(/,/g, '')));
    }
  }

  // Capture the last server block if loop ended without hitting TOTALS
  if (current) serverData.push(current);

  return { reportDate, totalSales, totalTips, serverData };
}
