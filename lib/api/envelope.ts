// Pure v1 API envelope. No next/server import; toResponse is the only thing that builds a Response.

export const API_ERROR_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  no_membership: 403,
  org_required: 400,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  stale_count: 409,
  rate_limited: 429,
  upgrade_required: 426,
  internal: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export const INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again.';

export interface FailOptions {
  requestId?: string;
  /** e.g. `{ fields: [{ path: 'lines.0.qty', message: '...' }] }`. Dropped for `internal`. */
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

export interface ApiResult<B> {
  status: number;
  body: B;
  headers: Record<string, string>;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiResult<{ data: T; meta?: Record<string, unknown> }> {
  return { status: 200, body: meta ? { data, meta } : { data }, headers: {} };
}

export function fail(code: ApiErrorCode, message: string, opts: FailOptions = {}): ApiResult<ApiErrorBody> {
  const headers: Record<string, string> = {};
  let details = code === 'internal' ? undefined : opts.details;
  if (code === 'rate_limited') {
    const secs = Math.max(Math.ceil(opts.retryAfterSeconds ?? 1), 1);
    headers['Retry-After'] = String(secs);
    details = { ...details, retryAfterSeconds: secs };
  }
  const error: ApiErrorBody['error'] = {
    code,
    message: code === 'internal' ? INTERNAL_MESSAGE : message,
  };
  if (opts.requestId) error.requestId = opts.requestId;
  if (details) error.details = details;
  return { status: API_ERROR_STATUS[code], body: { error }, headers };
}

export function toResponse(r: ApiResult<unknown>): Response {
  const requestId = (r.body as Partial<ApiErrorBody>).error?.requestId;
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: {
      'Content-Type': 'application/json',
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
      ...r.headers,
    },
  });
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Echo a caller's X-Request-Id only if it is log-safe; otherwise mint one with `generate`. */
export function requestIdFrom(
  headers: { get(name: string): string | null },
  generate: () => string = () => crypto.randomUUID(),
): string {
  const v = headers.get('x-request-id');
  return v && SAFE_REQUEST_ID.test(v) ? v : generate();
}
