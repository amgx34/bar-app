/**
 * What every POS source reduces to before it touches the database.
 *
 * Generalised from the body the 2Touch agent posts. An adapter (2Touch route,
 * Clover, Toast) only fetches and maps into this shape; `applyNormalized` in
 * `lib/pos/ingest.ts` is the one place that writes it, so every guard in
 * AGENTS.md applies to every source by construction.
 *
 * Absence always means "cannot say", never "nothing happened". A feed that ran
 * and found nothing is `[]`; a feed that failed is left undefined (optional
 * feeds) or empty with an `errors` entry (required feeds).
 */

export type ZReportRow = {
  report_date: string;
  total_sales: number;
  cc_tips:     number;
  /**
   * ABSENT means the POS does not report cash tips: the stored figure is left
   * alone. Present is written, except on a night a person counted by hand,
   * which keeps its figure (`cash_tips_source = 'manual'`).
   */
  cash_tips?:  number;
  // Tender split. Undefined is stored as NULL ("not reported"), never coerced
  // to 0 ("took no cash").
  cash_sales?: number;
  card_sales?: number;
};

export type EWReportRow = {
  shift_date:     string;
  employee_name:  string;
  total_sales:    number;
  tips_paid_out:  number;
  regular_hours:  number;
  overtime_hours: number;
};

export type ItemAuditRow = {
  sale_date:     string;
  item_name:     string;
  category_name: string;
  qty_sold:      number;
  net_sales:     number;
};

export type HourlySalesPayloadRow = {
  business_date: string;
  hour:          number;
  net_sales:     number;
  ticket_count:  number;
  tips:          number;
};

export type ServerSalesPayloadRow = {
  business_date: string;
  server_name:   string;
  net_sales:     number;
  ticket_count:  number;
  tips:          number;
};

export type NormalizedPayload = {
  /** 'rail-2touch-agent/1.4.0' | 'clover-api' | 'toast-api' */
  source:    string;
  pulledAt:  string;
  zReports:  ZReportRow[];
  ewReports: EWReportRow[];
  itemAudit: ItemAuditRow[];
  hourlySales?: HourlySalesPayloadRow[];
  serverSales?: ServerSalesPayloadRow[];
  /** Feed failures on the source side. Folded into the outcome, 5 max, 300 chars. */
  errors?: string[];
  /** A history pull, not the live cycle. The caller skips the sync-status write. */
  backfill?: boolean;
};
