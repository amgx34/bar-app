// ── US States ────────────────────────────────────────────────────────────────

// salesTaxRate = base state rate only (decimal). Add your local/county rate on top.
// 0 = no state sales tax (MT, OR, NH, DE, AK).
export const US_STATES = [
  { code: 'AL', name: 'Alabama',        noIncomeTax: false, salesTaxRate: 0.04    },
  { code: 'AK', name: 'Alaska',         noIncomeTax: true,  salesTaxRate: 0       },
  { code: 'AZ', name: 'Arizona',        noIncomeTax: false, salesTaxRate: 0.056   },
  { code: 'AR', name: 'Arkansas',       noIncomeTax: false, salesTaxRate: 0.065   },
  { code: 'CA', name: 'California',     noIncomeTax: false, salesTaxRate: 0.0725  },
  { code: 'CO', name: 'Colorado',       noIncomeTax: false, salesTaxRate: 0.029   },
  { code: 'CT', name: 'Connecticut',    noIncomeTax: false, salesTaxRate: 0.0635  },
  { code: 'DE', name: 'Delaware',       noIncomeTax: false, salesTaxRate: 0       },
  { code: 'DC', name: 'Washington DC',  noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'FL', name: 'Florida',        noIncomeTax: true,  salesTaxRate: 0.06    },
  { code: 'GA', name: 'Georgia',        noIncomeTax: false, salesTaxRate: 0.04    },
  { code: 'HI', name: 'Hawaii',         noIncomeTax: false, salesTaxRate: 0.04    },
  { code: 'ID', name: 'Idaho',          noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'IL', name: 'Illinois',       noIncomeTax: false, salesTaxRate: 0.0625  },
  { code: 'IN', name: 'Indiana',        noIncomeTax: false, salesTaxRate: 0.07    },
  { code: 'IA', name: 'Iowa',           noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'KS', name: 'Kansas',         noIncomeTax: false, salesTaxRate: 0.065   },
  { code: 'KY', name: 'Kentucky',       noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'LA', name: 'Louisiana',      noIncomeTax: false, salesTaxRate: 0.0445  },
  { code: 'ME', name: 'Maine',          noIncomeTax: false, salesTaxRate: 0.055   },
  { code: 'MD', name: 'Maryland',       noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'MA', name: 'Massachusetts',  noIncomeTax: false, salesTaxRate: 0.0625  },
  { code: 'MI', name: 'Michigan',       noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'MN', name: 'Minnesota',      noIncomeTax: false, salesTaxRate: 0.06875 },
  { code: 'MS', name: 'Mississippi',    noIncomeTax: false, salesTaxRate: 0.07    },
  { code: 'MO', name: 'Missouri',       noIncomeTax: false, salesTaxRate: 0.04225 },
  { code: 'MT', name: 'Montana',        noIncomeTax: false, salesTaxRate: 0       },
  { code: 'NE', name: 'Nebraska',       noIncomeTax: false, salesTaxRate: 0.055   },
  { code: 'NV', name: 'Nevada',         noIncomeTax: true,  salesTaxRate: 0.0685  },
  { code: 'NH', name: 'New Hampshire',  noIncomeTax: true,  salesTaxRate: 0       },
  { code: 'NJ', name: 'New Jersey',     noIncomeTax: false, salesTaxRate: 0.06625 },
  { code: 'NM', name: 'New Mexico',     noIncomeTax: false, salesTaxRate: 0.04875 },
  { code: 'NY', name: 'New York',       noIncomeTax: false, salesTaxRate: 0.04    },
  { code: 'NC', name: 'North Carolina', noIncomeTax: false, salesTaxRate: 0.0475  },
  { code: 'ND', name: 'North Dakota',   noIncomeTax: false, salesTaxRate: 0.05    },
  { code: 'OH', name: 'Ohio',           noIncomeTax: false, salesTaxRate: 0.0575  },
  { code: 'OK', name: 'Oklahoma',       noIncomeTax: false, salesTaxRate: 0.045   },
  { code: 'OR', name: 'Oregon',         noIncomeTax: false, salesTaxRate: 0       },
  { code: 'PA', name: 'Pennsylvania',   noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'RI', name: 'Rhode Island',   noIncomeTax: false, salesTaxRate: 0.07    },
  { code: 'SC', name: 'South Carolina', noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'SD', name: 'South Dakota',   noIncomeTax: true,  salesTaxRate: 0.045   },
  { code: 'TN', name: 'Tennessee',      noIncomeTax: true,  salesTaxRate: 0.07    },
  { code: 'TX', name: 'Texas',          noIncomeTax: true,  salesTaxRate: 0.0625  },
  { code: 'UT', name: 'Utah',           noIncomeTax: false, salesTaxRate: 0.0485  },
  { code: 'VT', name: 'Vermont',        noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'VA', name: 'Virginia',       noIncomeTax: false, salesTaxRate: 0.053   },
  { code: 'WA', name: 'Washington',     noIncomeTax: true,  salesTaxRate: 0.065   },
  { code: 'WV', name: 'West Virginia',  noIncomeTax: false, salesTaxRate: 0.06    },
  { code: 'WI', name: 'Wisconsin',      noIncomeTax: false, salesTaxRate: 0.05    },
  { code: 'WY', name: 'Wyoming',        noIncomeTax: true,  salesTaxRate: 0.04    },
];

// ── Social Security wage base by year ────────────────────────────────────────

export const SS_WAGE_BASE: Record<number, number> = {
  2025: 176100, 2024: 168600, 2023: 160200,
  2022: 147000, 2021: 142800, 2020: 137700,
};
export const DEFAULT_SS_BASE = 176100;

export function ssWageBase(year: number) {
  return SS_WAGE_BASE[year] ?? DEFAULT_SS_BASE;
}

// ── Money formatter ───────────────────────────────────────────────────────────

export function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ── Shared print styles ───────────────────────────────────────────────────────

export const PRINT_BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; padding: 16px; }
  h1 { font-size: 13pt; font-weight: bold; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 10pt; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 3px; }
  .disclaimer {
    background: #fff3cd; border: 2px solid #e6a817; padding: 10px 14px;
    margin-bottom: 16px; font-size: 8pt; text-align: center; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .disclaimer strong { display: block; font-size: 9pt; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 9pt; color: #444; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #555; padding: 4px 6px; }
  th { background: #e8e8e8; font-size: 8pt; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .box { border: 1px solid #000; padding: 4px 6px; }
  .box-num { font-size: 7pt; color: #555; }
  .box-label { font-size: 7.5pt; color: #333; }
  .box-value { font-size: 11pt; font-weight: bold; margin-top: 2px; }
  .needs-fill { color: #c00; font-style: italic; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 6px; }
  .full { grid-column: 1 / -1; }
  .section { margin-bottom: 14px; }
  .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #ccc; font-size: 9pt; }
  .row-label { color: #444; }
  .row-value { font-weight: bold; }
  .total-row { font-size: 10pt; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
  .footnote { font-size: 7.5pt; color: #666; margin-top: 12px; border-top: 1px solid #ccc; padding-top: 6px; line-height: 1.6; }
  @media print { body { padding: 8mm; } }
`;

export const DISCLAIMER_HTML = `
<div class="disclaimer">
  <strong>⚠ UNOFFICIAL DRAFT — NOT AN IRS OFFICIAL DOCUMENT ⚠</strong>
  This document was generated by Rail bar management software for reference purposes only.
  It is NOT a valid IRS tax form and must NOT be filed with the IRS, employees, or any government agency as-is.
  Figures may be incomplete or contain errors. Verify all amounts with a licensed CPA or tax professional.
  <strong style="display:block;margin-top:4px">Rail assumes no legal responsibility or liability for this output.</strong>
</div>`;

// ── Print helper ──────────────────────────────────────────────────────────────

export function openPrint(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Allow pop-ups to print documents.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_BASE_STYLES}</style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}
