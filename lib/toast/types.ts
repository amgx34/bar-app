// ── Toast API response types ──────────────────────────────────────────────────
//
// Written from Toast's documented response shapes, NOT from a live restaurant.
// Only fields Rail reads are listed, and almost all are optional because a
// field that is absent must read as "cannot say" and never crash the sync.
//
// Money in orders is DECIMAL DOLLARS in Toast's documentation. The old client
// header said cents; the two disagree and a sandbox response has to settle it,
// which is why TOAST_AMOUNTS_IN_CENTS exists (lib/pos/providers/toast/map.ts).
// Business dates arrive as integers, yyyyMMdd.

export type ToastLoginResponse = {
  token?: {
    tokenType?:   string;
    scope?:       string;
    /** Seconds. */
    expiresIn?:   number;
    accessToken?: string;
  };
  status?: string;
};

export type ToastRef = { guid: string };

// ── Restaurant ────────────────────────────────────────────────────────────────

export type ToastRestaurant = {
  guid?: string;
  general?: {
    name?:         string;
    locationName?: string;
    /** IANA zone, e.g. "America/New_York". */
    timeZone?:     string;
    /** Hour of day (0-23) the business day rolls over. */
    closeoutHour?: number;
  };
};

// ── Orders (ordersBulk) ───────────────────────────────────────────────────────

export type ToastRefundDetails = {
  /** Net of tax and tip, by Toast's documentation. */
  refundAmount?:      number;
  taxRefundAmount?:   number;
  tipRefundAmount?:   number;
  /** yyyyMMdd: the business date the refund happened. */
  refundBusinessDate?: number;
};

export type ToastPayment = {
  guid:           string;
  /** CASH, CREDIT, GIFTCARD, HOUSE_ACCOUNT, LEVELUP, OTHER, UNDETERMINED, or anything Toast adds. */
  type?:          string;
  /** OPEN, PENDING_AUTHORIZATION, AUTHORIZED, CAPTURED, DENIED, VOIDED, ... */
  paymentStatus?: string;
  /** Includes tax, excludes tip. */
  amount?:        number;
  tipAmount?:     number;
  /** ISO-8601. */
  paidDate?:      string;
  voidInfo?:      unknown;
  refund?:        ToastRefundDetails | null;
};

export type ToastSelection = {
  guid:          string;
  displayName?:  string;
  item?:         ToastRef | null;
  itemGroup?:    ToastRef | null;
  salesCategory?: ToastRef | null;
  quantity?:     number;
  /** The line after discounts, excluding tax. */
  price?:        number;
  voided?:       boolean;
};

export type ToastServiceCharge = {
  guid?:         string;
  chargeAmount?: number;
  gratuity?:     boolean;
};

export type ToastCheck = {
  guid:          string;
  /** After discounts and service charges, excluding tax and tip. */
  amount?:       number;
  taxAmount?:    number;
  /** OPEN, PAID or CLOSED. */
  paymentStatus?: string;
  voided?:       boolean;
  deleted?:      boolean;
  closedDate?:   string;
  payments?:     ToastPayment[];
  selections?:   ToastSelection[];
  appliedServiceCharges?: ToastServiceCharge[];
};

export type ToastOrder = {
  guid:               string;
  /** yyyyMMdd. */
  businessDate?:      number;
  voided?:            boolean;
  deleted?:           boolean;
  createdInTestMode?: boolean;
  server?:            ToastRef | null;
  checks?:            ToastCheck[];
};

// ── Labor ─────────────────────────────────────────────────────────────────────

export type ToastEmployee = {
  guid:          string;
  firstName?:    string;
  lastName?:     string;
  chosenName?:   string | null;
  deleted?:      boolean;
};

export type ToastTimeEntry = {
  guid:               string;
  employeeReference?: ToastRef | null;
  inDate?:            string;
  /** Absent while the person is still clocked in. */
  outDate?:           string | null;
  businessDate?:      number;
  regularHours?:      number;
  overtimeHours?:     number;
  declaredCashTips?:  number;
  deleted?:           boolean;
};

// ── Menus ─────────────────────────────────────────────────────────────────────

export type ToastMenuItem = {
  guid:           string;
  name?:          string;
  sku?:           string;
  price?:         number;
  salesCategory?: { guid?: string; name?: string } | null;
};

export type ToastMenuGroup = {
  guid:        string;
  name?:       string;
  menuItems?:  ToastMenuItem[];
  menuGroups?: ToastMenuGroup[];
};

export type ToastMenusResponse = {
  menus?: { guid: string; name?: string; menuGroups?: ToastMenuGroup[] }[];
};
