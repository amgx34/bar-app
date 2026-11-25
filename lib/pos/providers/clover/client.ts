/**
 * Typed Clover REST reader. Read-only by construction: it has a GET and a list
 * and nothing else.
 *
 * - Paged with limit/offset until an EMPTY page. A short page is not the end:
 *   the server may cap `limit` below what was asked (unverified, spec s.11).
 * - 429 and 5xx back off (Retry-After wins, else 1s doubling) and retry.
 * - A 401 asks for a fresh token once and retries once; that is the
 *   "token expired mid-sync" case.
 * - Every request has a timeout, and requests are spaced to stay under
 *   Clover's 16 requests per second per token.
 */

export class CloverHttpError extends Error {
  constructor(readonly status: number, readonly path: string, detail: string) {
    super(`Clover ${status} on ${path}${detail ? `: ${detail}` : ''}`);
    this.name = 'CloverHttpError';
  }
}

export type CloverClientOptions = {
  apiHost: string;
  merchantId: string;
  /** `rejected` is the token the API just refused, so the caller does not refresh twice. */
  getToken: (force?: { rejected: string }) => Promise<string>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  pageSize?: number;
  /** Safety valve on one list call. Exceeding it is an error, not a silent truncation. */
  maxElements?: number;
};

export type Params = Record<string, string | number | string[] | undefined>;

export function createCloverClient(o: CloverClientOptions) {
  const fetchFn = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = o.timeoutMs ?? 20000;
  const maxRetries = o.maxRetries ?? 4;
  const pageSize = o.pageSize ?? 500;
  const maxElements = o.maxElements ?? 100_000;
  const MIN_GAP_MS = 70; // under 16 requests per second
  let last = 0;
  let token: string | null = null;

  async function pace() {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  }

  function url(path: string, params: Params) {
    const u = new URL(`${o.apiHost}/v3/merchants/${o.merchantId}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) u.searchParams.append(k, String(one));
    }
    return u.toString();
  }

  async function get<T>(path: string, params: Params = {}): Promise<T> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      token ??= await o.getToken();
      await pace();
      let res: Response;
      try {
        res = await fetchFn(url(path, params), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Rail/1.0' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (attempt >= maxRetries) throw new CloverHttpError(0, path, e instanceof Error ? e.message : 'network error');
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.ok) return (await res.json()) as T;

      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await o.getToken({ rejected: token });
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      // Never put the response body or the token in the message beyond a short, non-secret hint.
      throw new CloverHttpError(res.status, path, (await res.text().catch(() => '')).slice(0, 120));
    }
  }

  async function list<T>(path: string, params: Params = {}): Promise<T[]> {
    const out: T[] = [];
    for (;;) {
      const page = await get<{ elements?: T[] }>(path, { ...params, limit: pageSize, offset: out.length });
      const batch = page.elements ?? [];
      if (!batch.length) return out;
      out.push(...batch);
      if (out.length > maxElements) throw new Error(`Clover ${path} returned more than ${maxElements} records; narrow the window`);
    }
  }

  return { get, list };
}
export type CloverClient = ReturnType<typeof createCloverClient>;
