// ── Toast API response types ──────────────────────────────────────────────────
// Amounts are in cents unless otherwise noted.

export type ToastAuthResponse = {
  token: {
    tokenType:   string;
    expiresIn:   number; // seconds
    accessToken: string;
    idToken:     string;
  };
};

// ── Orders ────────────────────────────────────────────────────────────────────

export type ToastPayment = {
  guid:        string;
  type:        'CREDIT' | 'CASH' | 'GIFT_CARD' | 'HOUSE_ACCOUNT' | string;
  amount:      number; // cents
  tipAmount:   number; // cents
  voidDate?:   string;
};

export type ToastCheck = {
  guid:          string;
  totalAmount:   number; // cents — includes tip
  tabName?:      string;
  tipAmount:     number; // cents
  paymentStatus: 'OPEN' | 'CLOSED' | 'VOID';
  payments?:     ToastPayment[];
  server?:       { guid: string };
};

export type ToastOrder = {
  guid:          string;
  entityType:    string;
  businessDate:  number; // YYYYMMDD integer
  closedDate?:   string; // ISO-8601
  createdDate?:  string;
  totalAmount:   number; // cents
  checks?:       ToastCheck[];
  server?:       { guid: string };
  voided?:       boolean;
  deleted?:      boolean;
};

export type ToastOrderBulkResponse = {
  orders:         ToastOrder[];
  nextPageToken?: string;
};

// ── Labor ────────────────────────────────────────────────────────────────────

export type ToastEmployee = {
  guid:                  string;
  firstName:             string;
  lastName:              string;
  externalEmployeeId?:   string;
  email?:                string;
  deleted:               boolean;
  archived?:             boolean;
};

export type ToastShift = {
  guid:         string;
  employee:     { guid: string };
  job:          { guid: string; title?: string };
  inDate:       string; // ISO-8601
  outDate?:     string; // ISO-8601
  businessDate: number; // YYYYMMDD
  regularHours?: number;
  overtimeHours?: number;
  hourlyWage?:   number; // cents per hour
  deleted?:      boolean;
};

export type ToastJob = {
  guid:      string;
  title:     string;
  tipped:    boolean;
  defaultWage?: { amount: number }; // cents/hr
};

// ── Menu / Inventory ──────────────────────────────────────────────────────────

export type ToastMenuGroup = {
  guid:  string;
  name:  string;
  items: ToastMenuItem[];
};

export type ToastMenuItem = {
  guid:           string;
  name:           string;
  price?:         number; // cents
  sku?:           string;
  hidden?:        boolean;
  salesCategory?: { guid: string; name: string };
  stockCount?:    number;
};
